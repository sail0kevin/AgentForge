import assert from "node:assert/strict";
import test from "node:test";
import { runService, type RunServicePersistence } from "./run-service";
import { parseRunServiceEvent, type RunServiceEvent } from "./run-contract";
import type { AgentConfig, WorkspaceMessage } from "../types";

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

test("统一服务产生版本化事件、唯一完成和前序 Agent 上下文", async () => {
  const h = harness();
  let secondPrior = "";
  const result = await runService({
    runId: "run-1", startedAt: "2026-07-15T09:00:00.000Z", input: "需求", initialTotalSpent: 0, budgetLimit: 10,
    signal: new AbortController().signal, persistence: h.persistence,
    eventSink: (event) => { h.events.push(parseRunServiceEvent(event)); },
    agents: [
      { agent: agent("a"), invoke: async () => ({ content: "analysis", inputTokens: 1, outputTokens: 1 }) },
      { agent: agent("b"), invoke: async ({ priorAssistantMessages }) => { secondPrior = priorAssistantMessages[0]?.content ?? ""; return { content: "report", inputTokens: 1, outputTokens: 1 }; } },
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
      { agent: agent("b"), invoke: async () => ({ content: "recovered", inputTokens: 1, outputTokens: 1 }) },
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
      { agent: agent("b"), invoke: async () => { secondCalled = true; return { content: "wrong", inputTokens: 1, outputTokens: 1 }; } },
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
    agents: [{ agent: agent("a"), invoke: async () => { called = true; return { content: "wrong", inputTokens: 1, outputTokens: 1 }; } }],
  });
  assert.equal(called, false);
  assert.equal(result.budgetStatus, "exhausted");
  assert.equal(h.events.some((event) => event.type === "budget_exhausted"), true);
});
