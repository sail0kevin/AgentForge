import { calculateCost } from "@/lib/billing";
import { estimateTokens } from "@/lib/utils";
import type { CallModel } from "./agent-comparison";

export type LongCatConfig = { apiKey: string; baseUrl: string; model: string };

export function readLongCatConfigFromEnv(): LongCatConfig {
  const apiKey = process.env.LONGCAT_API_KEY;
  const baseUrl = process.env.LONGCAT_BASE_URL;
  const model = process.env.LONGCAT_MODEL;
  if (!apiKey || !baseUrl || !model) {
    throw new Error("LONGCAT_ENV_MISSING: set LONGCAT_API_KEY, LONGCAT_BASE_URL and LONGCAT_MODEL in .env before running a real comparison.");
  }
  return { apiKey, baseUrl, model };
}

export type LongCatUsage = { inputTokens: number; outputTokens: number; costUsd: number; costCny: number; callCount: number };

/**
 * 使用原生 fetch 调用 LongCat API，避免 OpenAI SDK 的重试机制导致超时失效。
 * LongCat API 响应时间不稳定（3s~60s+），原生 fetch 配合 AbortController 能正确超时。
 */
async function fetchLongCat(input: {
  config: LongCatConfig;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  // 构造完整 API URL：baseUrl 已经是 https://api.longcat.chat/openai/v1，需要追加 /chat/completions
  const apiUrl = input.config.baseUrl.endsWith("/v1")
    ? `${input.config.baseUrl}/chat/completions`
    : `${input.config.baseUrl}/v1/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("LONGCAT_PROVIDER_TIMEOUT")), input.timeoutMs);

  // 如果外部 signal 也触发，同样中止
  const onParentAbort = () => controller.abort(new Error("LONGCAT_RUN_CANCELLED"));
  if (input.signal?.aborted) onParentAbort();
  else input.signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        max_tokens: input.maxTokens,
        temperature: input.temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`LONGCAT_HTTP_${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // LongCat 有时将内容放在 reasoning_content 而非 content，取两者之一
    const choice = data.choices?.[0];
    const content = choice?.message?.content || choice?.message?.reasoning_content || "";
    const inputTokens = data.usage?.prompt_tokens ?? estimateTokens(`${input.systemPrompt}\n${input.userPrompt}`);
    const outputTokens = data.usage?.completion_tokens ?? estimateTokens(content);

    return { content, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onParentAbort);
  }
}

/** Every call is budget-tracked with the same reserve-before/commit-after pattern as model-generators.ts, just without a DB-backed agent record. */
export function createLongCatCallModel(input: { config: LongCatConfig; maxTokens?: number; maxEstimatedInputTokens?: number; temperature?: number; maxTotalCostUsd: number; timeoutMs?: number; signal?: AbortSignal }): { callModel: CallModel; usage: LongCatUsage } {
  const model = input.config.model;
  const maxTokens = input.maxTokens ?? 4_000;
  const temperature = input.temperature ?? 0.3;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const usage: LongCatUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0, callCount: 0 };

  const callModel: CallModel = async (roleId, systemPrompt, userPrompt) => {
    const inputEstimate = estimateTokens(`${systemPrompt}\n${userPrompt}`);
    // 输入量是本地字符估算，作用是抑制动态 prompt 无界增长，不能替代 Provider 返回的精确 token 计量。
    if (input.maxEstimatedInputTokens && inputEstimate > input.maxEstimatedInputTokens) {
      throw new Error(`LONGCAT_INPUT_BUDGET_EXCEEDED: role ${roleId} estimated input=${inputEstimate} exceeds maxEstimatedInputTokens=${input.maxEstimatedInputTokens}`);
    }
    const projected = calculateCost(model, inputEstimate, maxTokens);
    if (usage.costUsd + projected.costUsd > input.maxTotalCostUsd) {
      throw new Error(`LONGCAT_BUDGET_EXCEEDED: role ${roleId} would exceed maxTotalCostUsd=${input.maxTotalCostUsd}`);
    }
    const result = await fetchLongCat({
      config: input.config,
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature,
      timeoutMs,
      signal: input.signal,
    });
    const cost = calculateCost(model, result.inputTokens, result.outputTokens);
    usage.inputTokens += result.inputTokens;
    usage.outputTokens += result.outputTokens;
    usage.costUsd = Number((usage.costUsd + cost.costUsd).toFixed(8));
    usage.costCny = Number((usage.costCny + cost.costCny).toFixed(8));
    usage.callCount += 1;
    if (usage.costUsd > input.maxTotalCostUsd) throw new Error(`LONGCAT_BUDGET_EXCEEDED: role ${roleId} pushed total past maxTotalCostUsd=${input.maxTotalCostUsd}`);
    return { content: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  };

  return { callModel, usage };
}
