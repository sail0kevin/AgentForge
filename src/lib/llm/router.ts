/**
 * LLM 模型调用路由器：框架对接各模型供应商的统一入口。
 * 按 agent.provider 选择策略（ollama / anthropic / OpenAI 兼容），
 * 上层 orchestrator 只消费 LLMResult，不感知供应商差异。
 * callLLM 在缺少 API Key 时降级为 simulateLLM 演示模式；
 * callLLMWithApiKey 是真实运行入口，缺凭证必须抛 CREDENTIAL_NOT_CONFIGURED。
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AgentConfig, LLMMessage, LLMResult } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";
import { assertSafeProviderUrl } from "@/lib/security/provider-url";

type CallLLMParams = {
  agent: AgentConfig;
  messages: LLMMessage[];
  baseUrl?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function callLLM({ agent, messages, baseUrl, signal, timeoutMs }: CallLLMParams): Promise<LLMResult> {
  return withProviderAbort(signal, timeoutMs, async (providerSignal) => {
    if (agent.provider === "ollama") {
      return callOllama(agent, messages, baseUrl, providerSignal);
    }

    const apiKey = getApiKey(agent.provider);
    if (!apiKey) {
      return simulateLLM(agent, messages, providerSignal);
    }

    if (agent.provider === "anthropic") {
      return callAnthropic(agent, messages, apiKey, baseUrl, providerSignal);
    }

    return callOpenAICompatible(agent, messages, apiKey, baseUrl, providerSignal);
  });
}

/**
 * 带 API Key 的模型调用入口（真实运行路径）。
 * 远程 Provider 缺少凭证时必须明确失败，不能用模拟回复伪装成模型成功。
 */
export async function callLLMWithApiKey({ agent, messages, apiKey, baseUrl, signal, timeoutMs }: CallLLMParams & { apiKey?: string | null }): Promise<LLMResult> {
  return withProviderAbort(signal, timeoutMs, async (providerSignal) => {
    if (agent.provider === "ollama") {
      return callOllama(agent, messages, baseUrl, providerSignal);
    }

    if (!apiKey) {
      throw new Error("CREDENTIAL_NOT_CONFIGURED");
    }

    if (agent.provider === "anthropic") {
      return callAnthropic(agent, messages, apiKey, baseUrl, providerSignal);
    }

    return callOpenAICompatible(agent, messages, apiKey, baseUrl, providerSignal);
  });
}

function providerTimeoutMs(override?: number) {
  const configured = override ?? Number(process.env.PROVIDER_TIMEOUT_MS || 120_000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 10 * 60_000) : 120_000;
}

async function withProviderAbort<T>(parentSignal: AbortSignal | undefined, timeoutMs: number | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let abortCode: "PROVIDER_TIMEOUT" | "RUN_CANCELLED" | null = null;
  const abortFromParent = () => {
    abortCode = "RUN_CANCELLED";
    controller.abort(new Error(abortCode));
  };
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    abortCode = "PROVIDER_TIMEOUT";
    controller.abort(new Error(abortCode));
  }, providerTimeoutMs(timeoutMs));

  try {
    controller.signal.throwIfAborted();
    return await operation(controller.signal);
  } catch (error) {
    if (abortCode) throw new Error(abortCode, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function getApiKey(provider: AgentConfig["provider"]) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "ollama") return null;
  return process.env.OPENAI_API_KEY;
}

/** OpenAI 兼容协议（OpenAI / DeepSeek / 其他兼容服务），通过 baseURL 指向非官方端点。 */
async function callOpenAICompatible(agent: AgentConfig, messages: LLMMessage[], apiKey: string, baseUrl: string | null | undefined, signal: AbortSignal): Promise<LLMResult> {
  await assertSafeProviderUrl(baseUrl || (agent.provider === "deepseek" ? "https://api.deepseek.com" : undefined));
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || (agent.provider === "deepseek" ? "https://api.deepseek.com" : undefined),
  });
  const response = await client.chat.completions.create({
    model: agent.model,
    messages,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens,
  }, { signal });
  const content = response.choices[0]?.message?.content || "";

  const hasUsage = !!response.usage && typeof response.usage.prompt_tokens === "number" && typeof response.usage.completion_tokens === "number";

  return {
    content,
    inputTokens: hasUsage ? response.usage!.prompt_tokens : estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: hasUsage ? response.usage!.completion_tokens : estimateTokens(content),
    tokenSource: hasUsage ? "provider" : "estimated",
  };
}

/** Anthropic 的 system 字段独立于 messages，需先提取再映射消息格式。 */
async function callAnthropic(agent: AgentConfig, messages: LLMMessage[], apiKey: string, baseUrl: string | null | undefined, signal: AbortSignal): Promise<LLMResult> {
  await assertSafeProviderUrl(baseUrl || undefined);
  const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined });
  const system = messages.find((message) => message.role === "system")?.content || agent.systemPrompt;
  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content,
    }));

  const response = await client.messages.create({
    model: agent.model,
    max_tokens: agent.maxTokens,
    temperature: agent.temperature,
    system,
    messages: anthropicMessages,
  }, { signal });
  const content = response.content.find((item) => item.type === "text")?.text || "";

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    tokenSource: "provider",
  };
}

/** Ollama：直接 fetch 其 /api/chat 接口，避免为本地服务引入 SDK 依赖。 */
async function callOllama(agent: AgentConfig, messages: LLMMessage[], configuredBaseUrl: string | null | undefined, signal: AbortSignal): Promise<LLMResult> {
  const baseUrl = configuredBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  await assertSafeProviderUrl(baseUrl);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: agent.model,
      messages,
      stream: false,
      options: {
        temperature: agent.temperature,
        num_predict: agent.maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama request failed: ${response.status} ${detail}`.trim());
  }

  const data = (await response.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const content = data.message?.content || "";

  const hasCounts = typeof data.prompt_eval_count === "number" && typeof data.eval_count === "number";

  return {
    content,
    inputTokens: hasCounts ? data.prompt_eval_count! : estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: hasCounts ? data.eval_count! : estimateTokens(content),
    tokenSource: hasCounts ? "provider" : "estimated",
  };
}

/** 无 API Key 时的演示降级：仅 callLLM 使用，真实运行路径（callLLMWithApiKey）不会进入。 */
async function simulateLLM(agent: AgentConfig, messages: LLMMessage[], signal: AbortSignal): Promise<LLMResult> {
  const userTask = [...messages].reverse().find((message) => message.role === "user")?.content || "Current task";
  const previousAgentNotes = messages
    .filter((message) => message.content.includes("[Previous agent"))
    .map((message) => message.content)
    .join("\n");

  const content = [
    `I am ${agent.name}, currently running in simulation mode.`,
    `Task: ${userTask.slice(0, 240)}`,
    previousAgentNotes ? `I reviewed earlier agent notes and will build on them: ${previousAgentNotes.slice(0, 260)}` : "This is the first specialist view in this run.",
    buildRoleSpecificAdvice(agent.name),
  ].join("\n\n");

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 450);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

  return {
    content,
    inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: estimateTokens(content),
    tokenSource: "estimated",
  };
}

function buildRoleSpecificAdvice(name: string) {
  if (name.toLowerCase().includes("product") || name.includes("产品")) {
    return "Recommendation: keep the MVP focused on agent setup, workspace runs, message persistence, usage tracking, and budget limits before adding advanced workflow features.";
  }
  if (name.toLowerCase().includes("architect") || name.includes("架构")) {
    return "Technical advice: keep the LLM router separate from orchestration, store billing values as Decimal, and use SSE for run event delivery.";
  }
  return "Delivery check: verify encrypted key storage, workspace run locking, budget checks before each call, and visible SSE error events.";
}
