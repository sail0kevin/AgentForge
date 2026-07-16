import { z } from "zod";

export type ToolPermission = "knowledge:read";
export type ToolExecutionContext = { userId: string; runId: string; toolCallId: string; signal: AbortSignal };

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  permission: ToolPermission;
  risk: "read-only";
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  timeoutMs: number;
  maxCallsPerRun: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
};

export class ToolExecutionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

const tools = new Map<string, ToolDefinition>();

export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
  if (tools.has(tool.id)) return;
  tools.set(tool.id, tool as ToolDefinition);
}

export function getTool(id: string): ToolDefinition | undefined {
  return tools.get(id);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function getSafeToolMetadata(tool: ToolDefinition) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    risk: tool.risk,
    timeoutMs: tool.timeoutMs,
    maxCallsPerRun: tool.maxCallsPerRun,
    inputSchema: z.toJSONSchema(tool.inputSchema),
    outputSchema: z.toJSONSchema(tool.outputSchema),
  };
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function withTimeout<T>(parentSignal: AbortSignal, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let code: "TOOL_TIMEOUT" | "RUN_CANCELLED" | null = null;
  const cancel = () => { code = "RUN_CANCELLED"; controller.abort(new Error(code)); };
  if (parentSignal.aborted) cancel();
  else parentSignal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { code = "TOOL_TIMEOUT"; controller.abort(new Error(code)); }, timeoutMs);
  try {
    controller.signal.throwIfAborted();
    return await operation(controller.signal);
  } catch (error) {
    if (code) throw new ToolExecutionError(code, code === "TOOL_TIMEOUT" ? "Tool execution exceeded its time limit." : "Run was cancelled.", code === "TOOL_TIMEOUT" ? 504 : 409);
    if (error instanceof ToolExecutionError) throw error;
    throw new ToolExecutionError("TOOL_EXECUTION_FAILED", "Tool execution failed.", 500);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", cancel);
  }
}

export async function executeRegisteredTool(input: {
  toolId: string;
  toolCallId: string;
  rawInput: unknown;
  userId: string;
  runId: string;
  allowedToolIds: Set<string>;
  callNumber: number;
  signal: AbortSignal;
}) {
  const tool = getTool(input.toolId);
  if (!tool) throw new ToolExecutionError("TOOL_NOT_FOUND", "Tool is not registered.", 404);
  if (!input.allowedToolIds.has(tool.id)) throw new ToolExecutionError("TOOL_NOT_AUTHORIZED", "The execution plan did not authorize this tool.", 403);
  if (input.callNumber > tool.maxCallsPerRun) throw new ToolExecutionError("TOOL_CALL_LIMIT_EXCEEDED", "Tool call limit reached for this run.", 429);
  if (jsonBytes(input.rawInput) > tool.maxInputBytes) throw new ToolExecutionError("TOOL_INPUT_TOO_LARGE", "Tool input exceeds its size limit.", 413);
  const parsedInput = tool.inputSchema.safeParse(input.rawInput);
  if (!parsedInput.success) throw new ToolExecutionError("TOOL_INPUT_INVALID", parsedInput.error.issues[0]?.message ?? "Tool input is invalid.");
  const output = await withTimeout(input.signal, tool.timeoutMs, (signal) => tool.execute(parsedInput.data, { userId: input.userId, runId: input.runId, toolCallId: input.toolCallId, signal }));
  const parsedOutput = tool.outputSchema.safeParse(output);
  if (!parsedOutput.success) throw new ToolExecutionError("TOOL_OUTPUT_INVALID", "Tool returned an invalid result.", 500);
  if (jsonBytes(parsedOutput.data) > tool.maxOutputBytes) throw new ToolExecutionError("TOOL_OUTPUT_TOO_LARGE", "Tool output exceeds its size limit.", 413);
  return parsedOutput.data;
}
