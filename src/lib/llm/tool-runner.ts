import { getTool, parseToolUse, type ToolResult } from "@/lib/tools/registry";
import type { AgentConfig, LLMMessage } from "@/lib/types";
import { callLLMWithApiKey } from "@/lib/llm/router";

/**
 * 运行一轮"工具调用增强"的 LLM 调用。
 * 如果 LLM 返回了 USE_TOOL 指令，执行工具并把结果拼回对话。
 */
export async function runToolEnabledTurn(params: {
  agent: AgentConfig;
  messages: LLMMessage[];
  apiKey?: string | null;
  baseUrl?: string | null;
  maxToolTurns?: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number; toolTrace: string[] }> {
  const { agent, messages, apiKey, baseUrl } = params;
  const maxToolTurns = params.maxToolTurns ?? 2;
  const trace: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let currentMessages = [...messages];

  for (let i = 0; i < maxToolTurns; i++) {
    const result = await callLLMWithApiKey({ agent, messages: currentMessages, apiKey, baseUrl });
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;

    const toolUse = parseToolUse(result.content);
    if (!toolUse) return { content: result.content, inputTokens, outputTokens, toolTrace: trace };

    const tool = getTool(toolUse.toolId);
    if (!tool) {
      currentMessages = [...currentMessages, { role: "assistant", content: result.content }, { role: "user", content: `Tool "${toolUse.toolId}" not found.` }];
      trace.push(`[tool_not_found: ${toolUse.toolId}]`);
      continue;
    }

    const toolResult = await tool.execute(toolUse.input);
    trace.push(`[tool_exec: ${tool.id}]`);
    currentMessages = [...currentMessages, { role: "assistant", content: result.content }, { role: "user", content: `Tool output: ${toolResult.output}` }];
  }

  // Final turn — just return LLM response
  const finalResult = await callLLMWithApiKey({ agent, messages: currentMessages, apiKey, baseUrl });
  inputTokens += finalResult.inputTokens;
  outputTokens += finalResult.outputTokens;
  return { content: finalResult.content, inputTokens, outputTokens, toolTrace: trace };
}
