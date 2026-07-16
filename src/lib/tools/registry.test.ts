import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { executeRegisteredTool, getSafeToolMetadata, getTool, registerTool, ToolExecutionError } from "./registry";

const successToolId = `test-read-${Date.now()}`;
let executions = 0;
registerTool({
  id: successToolId,
  name: "Test read",
  description: "Read a deterministic test value.",
  permission: "knowledge:read",
  risk: "read-only",
  inputSchema: z.object({ query: z.string().min(2) }),
  outputSchema: z.object({ answer: z.string() }),
  timeoutMs: 100,
  maxCallsPerRun: 2,
  maxInputBytes: 100,
  maxOutputBytes: 100,
  async execute(input) { executions += 1; return { answer: input.query }; },
});

function invoke(overrides: Partial<Parameters<typeof executeRegisteredTool>[0]> = {}) {
  return executeRegisteredTool({
    toolId: successToolId,
    toolCallId: crypto.randomUUID(),
    rawInput: { query: "safe" },
    userId: "user-1",
    runId: "run-1",
    allowedToolIds: new Set([successToolId]),
    callNumber: 1,
    signal: new AbortController().signal,
    ...overrides,
  });
}

test("tool registration is idempotent and exposes machine-readable safe metadata", () => {
  const tool = getTool(successToolId)!;
  registerTool({ ...tool, name: "must not replace" });
  assert.equal(getTool(successToolId)?.name, "Test read");
  const metadata = getSafeToolMetadata(tool);
  assert.equal(metadata.permission, "knowledge:read");
  assert.equal((metadata.inputSchema as { type?: string }).type, "object");
});

test("unauthorized and invalid calls are rejected before execution", async () => {
  const before = executions;
  await assert.rejects(invoke({ allowedToolIds: new Set() }), (error) => error instanceof ToolExecutionError && error.code === "TOOL_NOT_AUTHORIZED");
  await assert.rejects(invoke({ rawInput: { query: "x" } }), (error) => error instanceof ToolExecutionError && error.code === "TOOL_INPUT_INVALID");
  assert.equal(executions, before);
});

test("valid calls return schema-checked output and enforce call limits", async () => {
  assert.deepEqual(await invoke(), { answer: "safe" });
  await assert.rejects(invoke({ callNumber: 3 }), (error) => error instanceof ToolExecutionError && error.code === "TOOL_CALL_LIMIT_EXCEEDED");
});

test("tool timeout aborts execution with a stable error", async () => {
  const id = `test-timeout-${Date.now()}`;
  registerTool({
    id, name: "Timeout", description: "Timeout test", permission: "knowledge:read", risk: "read-only",
    inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }), timeoutMs: 10, maxCallsPerRun: 1, maxInputBytes: 10, maxOutputBytes: 20,
    execute: async (_input, context) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true }), 100);
      context.signal.addEventListener("abort", () => { clearTimeout(timer); reject(context.signal.reason); }, { once: true });
    }),
  });
  await assert.rejects(invoke({ toolId: id, rawInput: {}, allowedToolIds: new Set([id]) }), (error) => error instanceof ToolExecutionError && error.code === "TOOL_TIMEOUT");
});
