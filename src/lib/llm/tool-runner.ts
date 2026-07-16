import { callLLMWithApiKey } from "@/lib/llm/router";
import { executeRegisteredTool } from "@/lib/tools/registry";
import type { AgentConfig, LLMMessage } from "@/lib/types";

/**
 * 结构化 Tool调用适配器。调用由应用/工作流明确提供，不再从模型自由文本中解析 USE_TOOL。
 * 持久化主链路使用 executeToolForRun；这里保留给图节点的纯执行组合。
 */
export async function runToolEnabledTurn(params: {
  agent: AgentConfig;
  messages: LLMMessage[];
  apiKey?: string | null;
  baseUrl?: string | null;
  userId: string;
  runId: string;
  signal: AbortSignal;
  allowedToolIds: Set<string>;
  toolCalls: Array<{ toolCallId: string; toolId: string; input: unknown }>;
}) {
  let currentMessages = [...params.messages];
  const toolTrace: string[] = [];
  for (const [index, call] of params.toolCalls.entries()) {
    const output = await executeRegisteredTool({
      toolId: call.toolId, toolCallId: call.toolCallId, rawInput: call.input, userId: params.userId, runId: params.runId,
      allowedToolIds: params.allowedToolIds, callNumber: index + 1, signal: params.signal,
    });
    toolTrace.push(call.toolCallId);
    currentMessages = [...currentMessages, { role: "user", content: `Tool ${call.toolId} (${call.toolCallId}) returned:\n${JSON.stringify(output)}` }];
  }
  const result = await callLLMWithApiKey({ agent: params.agent, messages: currentMessages, apiKey: params.apiKey, baseUrl: params.baseUrl, signal: params.signal });
  return { ...result, toolTrace };
}
