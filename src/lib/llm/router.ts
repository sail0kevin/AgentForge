/**
 * LLM 模型调用路由器
 *
 * 作用：作为整个框架对接各大模型 API 的统一入口，屏蔽不同供应商的差异。
 *       上层 orchestrator 只需要传 agent 配置 + 消息列表，
 *       不需要关心底下用的是 Ollama 还是 OpenAI。
 *
 * 原理：采用策略模式（Strategy Pattern），根据 agent.provider 字段选择对应的调用函数：
 *       - "ollama"     -> 走本地 HTTP 调用 /api/chat
 *       - "anthropic"  -> 走 Anthropic SDK
 *       - "openai" / "deepseek" / "custom" -> 走 OpenAI SDK 兼容客户端
 *
 *      当没有 API Key 时自动进入 simulateLLM() 模拟模式，保证 UI 可演示。
 *
 * 在整个框架里扮演什么角色：
 *       这是"模型接入层"。上层的 orchestrator 不需要知道模型细节，
 *       只需要拿到 LLMResult { content, inputTokens, outputTokens } 即可。
 *       未来新增模型供应商只需要加一个 case，不需要改上层代码。
 *
 * 如何调用：
 *   import { callLLMWithApiKey } from "@/lib/llm/router";
 *   const result = await callLLMWithApiKey({ agent, messages, apiKey, baseUrl });
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { decryptApiKey } from "@/lib/security/crypto";
import type { AgentConfig, LLMMessage, LLMResult } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";

type CallLLMParams = {
  agent: AgentConfig;
  messages: LLMMessage[];
  baseUrl?: string | null;
};

export async function callLLM({ agent, messages, baseUrl }: CallLLMParams): Promise<LLMResult> {
  if (agent.provider === "ollama") {
    return callOllama(agent, messages);
  }

  const apiKey = getApiKey(agent.provider);
  if (!apiKey) {
    return simulateLLM(agent, messages);
  }

  if (agent.provider === "anthropic") {
    return callAnthropic(agent, messages, apiKey, baseUrl);
  }

  return callOpenAICompatible(agent, messages, apiKey, baseUrl);
}

/**
 * 带 API Key 的模型调用入口（主要对外接口）
 *
 * 作用：前端或 orchestrator 传入明确的 API Key，路由器根据 agent.provider 选择调用方式
 *
 * 参数：
 *   - agent: Agent 配置（包含 provider, model, temperature 等）
 *   - messages: 对话消息列表
 *   - apiKey: 明文 API Key（远程 Provider 必填；Ollama 不需要）
 *   - baseUrl: 自定义 API 地址（可选）
 *
 * 返回值：LLMResult { content: string, inputTokens: number, outputTokens: number }
 *
 * 如何调用：
 *   const result = await callLLMWithApiKey({ agent, messages, apiKey: "sk-xxx" });
 */
export async function callLLMWithApiKey({ agent, messages, apiKey, baseUrl }: CallLLMParams & { apiKey?: string | null }): Promise<LLMResult> {
  if (agent.provider === "ollama") {
    return callOllama(agent, messages, baseUrl);
  }

  if (!apiKey) {
    // 真实运行路径缺少远程凭证时必须明确失败，不能用模拟回复伪装成模型成功。
    throw new Error("CREDENTIAL_NOT_CONFIGURED");
  }

  if (agent.provider === "anthropic") {
    return callAnthropic(agent, messages, apiKey, baseUrl);
  }

  return callOpenAICompatible(agent, messages, apiKey, baseUrl);
}

export function decryptStoredApiKey(apiKey?: { encryptedKey: string; iv: string; authTag: string } | null) {
  if (!apiKey) return null;
  return decryptApiKey(apiKey.encryptedKey, apiKey.iv, apiKey.authTag);
}

function getApiKey(provider: AgentConfig["provider"]) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "ollama") return null;
  return process.env.OPENAI_API_KEY;
}

/**
 * OpenAI 兼容协议调用（OpenAI / DeepSeek / 其他兼容服务）
 *
 * 作用：封装 OpenAI SDK，统一处理 OpenAI、DeepSeek 和其他兼容 OpenAI 协议的模型
 *
 * 原理：创建 OpenAI 客户端时可传入 baseURL 参数来指定非官方地址，
 *       这样同一个代码既能调 api.openai.com，也能调 DeepSeek 或本地代理服务。
 *
 * 参数：
 *   - agent: Agent 配置
 *   - messages: 对话消息列表
 *   - apiKey: API Key
 *   - baseUrl: 可选的自定义地址
 *
 * 返回值：LLMResult
 */
async function callOpenAICompatible(agent: AgentConfig, messages: LLMMessage[], apiKey: string, baseUrl?: string | null): Promise<LLMResult> {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || (agent.provider === "deepseek" ? "https://api.deepseek.com" : undefined),
  });
  const response = await client.chat.completions.create({
    model: agent.model,
    messages,
    temperature: agent.temperature,
    max_tokens: agent.maxTokens,
  });
  const content = response.choices[0]?.message?.content || "";

  return {
    content,
    inputTokens: response.usage?.prompt_tokens ?? estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: response.usage?.completion_tokens ?? estimateTokens(content),
  };
}

/**
 * Anthropic Claude 模型调用
 *
 * 作用：封装 Anthropic SDK，处理 Claude 系列模型的调用
 *
 * 原理：Anthropic 的 API 格式与 OpenAI 不同——system 字段是独立的（不在 messages 里），
 *       需要先从 messages 中提取 system 内容，再映射为 Anthropic 的 message 格式。
 *
 * 参数：
 *   - agent: Agent 配置
 *   - messages: 对话消息列表
 *   - apiKey: Anthropic API Key
 *   - baseUrl: 可选的自定义地址
 *
 * 返回值：LLMResult
 */
async function callAnthropic(agent: AgentConfig, messages: LLMMessage[], apiKey: string, baseUrl?: string | null): Promise<LLMResult> {
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
  });
  const content = response.content.find((item) => item.type === "text")?.text || "";

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * 本地 Ollama 模型调用
 *
 * 作用：通过 HTTP 请求调用本地或远程 Ollama 服务
 *
 * 原理：Ollama 提供 OpenAI 兼容的 /api/chat 接口，但这里直接用原始 fetch 调用，
 *       避免引入额外依赖。stream: false 表示等待完整响应后再返回。
 *
 * 参数：
 *   - agent: Agent 配置
 *   - messages: 对话消息列表
 *   - configuredBaseUrl: 可选的自定义地址，默认 http://localhost:11434
 *
 * 返回值：LLMResult
 *
 * 异常：当 HTTP 状态码非 2xx 时抛出 Error，包含状态码和响应体
 */
async function callOllama(agent: AgentConfig, messages: LLMMessage[], configuredBaseUrl?: string | null): Promise<LLMResult> {
  const baseUrl = configuredBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  return {
    content,
    inputTokens: data.prompt_eval_count ?? estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: data.eval_count ?? estimateTokens(content),
  };
}

/**
 * 模拟 LLM 响应（无 API Key 时的降级方案）
 *
 * 作用：当用户没有配置 API Key 时，返回一段模拟回复，保证 UI 流程可演示
 *
 * 原理：根据 Agent 名称中的关键词（如"产品"、"架构"）生成不同角色的模拟回复，
 *       固定延迟 450ms 模拟网络延迟。
 *
 * 参数：
 *   - agent: Agent 配置
 *   - messages: 对话消息列表
 *
 * 返回值：LLMResult（标记为模拟输出）
 */
async function simulateLLM(agent: AgentConfig, messages: LLMMessage[]): Promise<LLMResult> {
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

  await new Promise((resolve) => setTimeout(resolve, 450));

  return {
    content,
    inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: estimateTokens(content),
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
