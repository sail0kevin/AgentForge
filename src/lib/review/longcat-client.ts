import { calculateCost } from "@/lib/billing";
import { callLLMWithApiKey } from "@/lib/llm/router";
import type { AgentConfig } from "@/lib/types";
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

/** Every call is budget-tracked with the same reserve-before/commit-after pattern as model-generators.ts, just without a DB-backed agent record. */
export function createLongCatCallModel(input: { config: LongCatConfig; maxTokens?: number; maxEstimatedInputTokens?: number; temperature?: number; maxTotalCostUsd: number; timeoutMs?: number; signal?: AbortSignal }): { callModel: CallModel; usage: LongCatUsage } {
  const agent: AgentConfig = {
    id: "longcat-comparison",
    name: "LongCat-2.0",
    avatar: "",
    color: "",
    provider: "custom",
    model: input.config.model,
    systemPrompt: "",
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens ?? 4_000,
  };
  const usage: LongCatUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0, callCount: 0 };

  const callModel: CallModel = async (roleId, systemPrompt, userPrompt) => {
    const inputEstimate = estimateTokens(`${systemPrompt}\n${userPrompt}`);
    // 输入量是本地字符估算，作用是抑制动态 prompt 无界增长，不能替代 Provider 返回的精确 token 计量。
    if (input.maxEstimatedInputTokens && inputEstimate > input.maxEstimatedInputTokens) {
      throw new Error(`LONGCAT_INPUT_BUDGET_EXCEEDED: role ${roleId} estimated input=${inputEstimate} exceeds maxEstimatedInputTokens=${input.maxEstimatedInputTokens}`);
    }
    const projected = calculateCost(agent.model, inputEstimate, agent.maxTokens);
    if (usage.costUsd + projected.costUsd > input.maxTotalCostUsd) {
      throw new Error(`LONGCAT_BUDGET_EXCEEDED: role ${roleId} would exceed maxTotalCostUsd=${input.maxTotalCostUsd}`);
    }
    const result = await callLLMWithApiKey({
      agent,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      apiKey: input.config.apiKey,
      baseUrl: input.config.baseUrl,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    });
    const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
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
