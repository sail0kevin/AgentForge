import assert from "node:assert/strict";
import test from "node:test";
import { runService, type RunServicePersistence } from "./run-service";
import { parseRunServiceEvent, type RunServiceEvent } from "./run-contract";
import type { AgentConfig, WorkspaceMessage } from "../types";
import type { TraceAttributes, TraceProvider, TraceSpan } from "../observability/tracing";

const agent = (id: string): AgentConfig => ({ id, name: `Agent ${id}`, avatar: "AI", color: "#000", provider: "ollama", model: "unknown-test-model", systemPrompt: "test", temperature: 0, maxTokens: 10 });

function harness() {
  const events: RunServiceEvent[] = [];
  const messages: WorkspaceMessage[] = [];
  let completions = 0;
  const persistence: RunServicePersistence = {
    saveUserMessage: async (message) => { messages.push(message); },
    saveAssistantResult: async ({ message }) => { messages.push(message); },
    saveFailedMessage: async (message) => { messages.push(message); },
    updateProgress: async () => undefined,
    completeRun: async () => { completions += 1; return "2026-07-15T09:00:01.000Z"; },
  };
  return { events, messages, persistence, getCompletions: () => completions };
}

function traceHarness() {
  const spans: { name: string; attributes: Record<string, string | number | boolean>; ended: boolean }[] = [];
  const provider: TraceProvider = {
    startSpan: (name: string, attributes?: TraceAttributes): TraceSpan => {
      const entry = { name, attributes: Object.fromEntries(Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean>, ended: false };
      spans.push(entry);
      return {
        setAttribute: (key, value) => { entry.attributes[key] = value as string | number | boolean; return undefined as never; },
        setStatus: () => undefined as never,
        end: () => { entry.ended = true; },
      };
    },
  };
  return { provider, spans };
}

function contextTraceHarness() {
  const entered: string[] = [];
  const provider: TraceProvider = {
    startSpan: (name: string): TraceSpan => {
      void name;
      return { setAttribute: () => undefined as never, setStatus: () => undefined as never, end: () => undefined };
    },
    runWithSpan: async (_span, run) => {
      entered.push("context-entered");
      return run();
    },
  };
  return { provider, entered };
}

test("统一服务产生版本化事件、唯一完成和前序 Agent 上下文", async () => {
  const h = harness();
  let secondPrior = "";
  const result = await runService({
    runId: "run-1", startedAt: "2026-07-15T09:00:00.000Z", input: "需求", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence,
    eventSink: (event) => { h.events.push(parseRunServiceEvent(event)); },
    agents: [
      { agent: agent("a"), invoke: async () => ({ content: "analysis", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }) },
      { agent: agent("b"), invoke: async ({ priorAssistantMessages }) => { secondPrior = priorAssistantMessages[0]?.content ?? ""; return { content: "report", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }; } },
    ],
  });
  assert.equal(secondPrior, "analysis");
  assert.equal(result.budgetStatus, "idle");
  assert.equal(h.getCompletions(), 1);
  assert.equal(h.events.filter((event) => event.type === "run_completed").length, 1);
  assert.ok(h.events.every((event) => event.version === 1 && event.runId === "run-1"));
  assert.deepEqual(h.events.map((event) => event.type), ["run_created", "user_message_created", "agent_started", "agent_completed", "agent_started", "agent_completed", "run_completed"]);
});

test("前序 Agent 失败后继续，但最终状态保持 warning", async () => {
  const h = harness();
  const result = await runService({
    runId: "run-2", startedAt: "2026-07-15T09:00:00.000Z", input: "需求", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: (event) => { h.events.push(event); },
    agents: [
      { agent: agent("a"), invoke: async () => { throw new Error("fetch failed"); } },
      { agent: agent("b"), invoke: async () => ({ content: "recovered", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }) },
    ],
  });
  assert.equal(result.budgetStatus, "warning");
  assert.deepEqual(h.events.filter((event) => event.type === "agent_started").map((event) => event.type), ["agent_started", "agent_started"]);
});

test("Provider 超时停止后续 Agent并只完成一次", async () => {
  const h = harness();
  let secondCalled = false;
  const result = await runService({
    runId: "run-3", startedAt: "2026-07-15T09:00:00.000Z", input: "需求", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: (event) => { h.events.push(event); },
    agents: [
      { agent: agent("a"), invoke: async () => { throw new Error("PROVIDER_TIMEOUT"); } },
      { agent: agent("b"), invoke: async () => { secondCalled = true; return { content: "wrong", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }; } },
    ],
  });
  assert.equal(secondCalled, false);
  assert.equal(result.errorCode, "PROVIDER_TIMEOUT");
  assert.equal(h.getCompletions(), 1);
});

test("开始时预算已经耗尽，不调用 Agent", async () => {
  const h = harness();
  let called = false;
  const result = await runService({
    runId: "run-4", startedAt: "2026-07-15T09:00:00.000Z", input: "需求", initialTotalSpent: 1, budgetLimit: 1,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: (event) => { h.events.push(event); },
    agents: [{ agent: agent("a"), invoke: async () => { called = true; return { content: "wrong", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }; } }],
  });
  assert.equal(called, false);
  assert.equal(result.budgetStatus, "exhausted");
  assert.equal(h.events.some((event) => event.type === "budget_exhausted"), true);
});

test("tracing records measured token and cost values and closes spans", async () => {
  const h = harness();
  const trace = traceHarness();
  await runService({
    runId: "run-trace", startedAt: "2026-07-15T09:00:00.000Z", input: "trace", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: () => undefined, traceProvider: trace.provider,
    agents: [{ agent: agent("a"), invoke: async () => ({ content: "done", inputTokens: 100, outputTokens: 50, tokenSource: "estimated" as const }) }],
  });
  const agentSpan = trace.spans.find((span) => span.name === "agentforge.workspace.agent");
  const runSpan = trace.spans.find((span) => span.name === "agentforge.workspace.run");
  assert.ok(agentSpan?.ended);
  assert.equal(agentSpan?.attributes["agentforge.input_tokens"], 100);
  assert.equal(agentSpan?.attributes["agentforge.output_tokens"], 50);
  assert.equal(agentSpan?.attributes["agentforge.cost_usd"], 0.00025);
  assert.ok(runSpan?.ended);
  assert.equal(runSpan?.attributes["agentforge.total_cost_usd"], 0.00025);
});

test("tracing closes failed agent spans with a safe error code", async () => {
  const h = harness();
  const trace = traceHarness();
  await runService({
    runId: "run-trace-failure", startedAt: "2026-07-15T09:00:00.000Z", input: "trace", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: () => undefined, traceProvider: trace.provider,
    agents: [{ agent: agent("a"), invoke: async () => { throw new Error("PROVIDER_TIMEOUT secret details"); } }],
  });
  const agentSpan = trace.spans.find((span) => span.name === "agentforge.workspace.agent");
  assert.ok(agentSpan?.ended);
  assert.equal(agentSpan?.attributes["agentforge.error_code"], "PROVIDER_TIMEOUT");
  assert.ok(!Object.values(agentSpan?.attributes ?? {}).some((value) => String(value).includes("secret details")));
});

test("tracing executes nested run work in the provider span context when supported", async () => {
  const h = harness();
  const trace = contextTraceHarness();
  await runService({
    runId: "run-trace-context", startedAt: "2026-07-15T09:00:00.000Z", input: "trace", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence, eventSink: () => undefined, traceProvider: trace.provider,
    agents: [{ agent: agent("a"), invoke: async () => ({ content: "done", inputTokens: 1, outputTokens: 1, tokenSource: "estimated" as const }) }],
  });
  assert.deepEqual(trace.entered, ["context-entered", "context-entered"]);
});
