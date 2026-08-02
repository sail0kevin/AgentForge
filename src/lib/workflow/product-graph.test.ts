import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import { continueProductWorkflow, createProductWorkflowGraph, resumeProductWorkflow, startProductWorkflow, type ProductWorkflowDependencies } from "./product-graph";
import type { TraceAttributes, TraceProvider, TraceSpan } from "../observability/tracing";

function traceHarness() {
  const spans: { attributes: Record<string, string | number | boolean>; ended: boolean }[] = [];
  const provider: TraceProvider = {
    startSpan: (_name: string, attributes?: TraceAttributes): TraceSpan => {
      const entry = { attributes: Object.fromEntries(Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean>, ended: false };
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

test("workflow pauses for approval and resumes without repeating completed side effects", async () => {
  const calls = { plan: 0, review: 0, approve: 0, report: 0 };
  let receivedPatch: unknown = null;
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; return { planningArtifactId: "plan-1", status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; return { reviewWorkflowId: "review-1", status: "needs_human" }; },
    approve: async (input) => { calls.approve += 1; receivedPatch = input.taskPatch ?? null; },
    report: async () => { calls.report += 1; return { reportArtifactId: "report-1", productUIReportGroupId: "product-ui-group-record-1", status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  const first = await startProductWorkflow({ graph, workflowId: "workflow-1", threadId: "thread-1", userId: "user-1", requirement: "Build a detailed admin portal with roles and audit logs." });

  assert.equal(calls.plan, 1);
  assert.equal(calls.review, 1);
  assert.equal(calls.approve, 0);
  assert.equal(calls.report, 0);
  assert.ok("__interrupt__" in first);

  const patch = { schemaVersion: 1 as const, taskEdits: [{ taskId: "task-1", title: "人工确认后的任务" }] };
  const completed = await resumeProductWorkflow({ graph, threadId: "thread-1", resume: { kind: "approval", decision: "hybrid", note: "Balance delivery and maintainability.", taskPatch: patch } });
  assert.equal(completed.finalStatus, "completed");
  assert.equal(completed.reportArtifactId, "report-1");
  assert.equal(completed.productUIReportGroupId, "product-ui-group-record-1");
  assert.deepEqual(calls, { plan: 1, review: 1, approve: 1, report: 1 });
  assert.deepEqual(receivedPatch, patch);
});

test("clarification resumes into a new bounded planning round", async () => {
  const requirements: string[] = [];
  const dependencies: ProductWorkflowDependencies = {
    plan: async ({ requirement }) => {
      requirements.push(requirement);
      if (requirements.length === 1) return { planningArtifactId: "plan-clarify", status: "needs_clarification", questions: ["Who can access the admin area?"] };
      return { planningArtifactId: "plan-ready", status: "ready", questions: [] };
    },
    review: async () => ({ reviewWorkflowId: "review-done", status: "approved" }),
    approve: async () => undefined,
    report: async () => ({ reportArtifactId: "report-done", status: "completed" }),
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  const first = await startProductWorkflow({ graph, workflowId: "workflow-2", threadId: "thread-2", userId: "user-1", requirement: "Build an admin portal for a small education product." });
  assert.ok("__interrupt__" in first);

  const completed = await resumeProductWorkflow({ graph, threadId: "thread-2", resume: { kind: "clarification", answer: "Teachers are editors; students are read-only." } });
  assert.equal(completed.finalStatus, "completed");
  assert.equal(requirements.length, 2);
  assert.match(requirements[1], /Teachers are editors/);
});

test("crash recovery continues from the latest checkpoint without repeating the completed plan", async () => {
  const calls = { plan: 0, review: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; return { planningArtifactId: "plan-recover", status: "ready", questions: [] }; },
    review: async () => {
      calls.review += 1;
      if (calls.review === 1) throw new Error("TRANSIENT_REVIEW_FAILURE");
      return { reviewWorkflowId: "review-recover", status: "approved" };
    },
    approve: async () => undefined,
    report: async () => { calls.report += 1; return { reportArtifactId: "report-recover", status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  await assert.rejects(
    startProductWorkflow({ graph, workflowId: "workflow-3", threadId: "thread-3", userId: "user-1", requirement: "Build a recoverable workflow with durable checkpoints and audit records." }),
    /TRANSIENT_REVIEW_FAILURE/,
  );

  const completed = await continueProductWorkflow({ graph, threadId: "thread-3" });
  assert.equal(completed.finalStatus, "completed");
  assert.deepEqual(calls, { plan: 1, review: 2, report: 1 });
});

test("workflow node tracing closes each executed node without recording requirement text", async () => {
  const trace = traceHarness();
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => ({ planningArtifactId: "plan-trace", status: "ready", questions: [] }),
    review: async () => ({ reviewWorkflowId: "review-trace", status: "approved" }),
    approve: async () => undefined,
    report: async () => ({ reportArtifactId: "report-trace", status: "completed" }),
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver(), trace.provider);
  const completed = await startProductWorkflow({ graph, workflowId: "workflow-trace", threadId: "thread-trace", userId: "user-trace", requirement: "secret requirement must not be traced" });
  assert.equal(completed.finalStatus, "completed");
  assert.equal(trace.spans.length, 4);
  assert.ok(trace.spans.every((span) => span.ended));
  assert.ok(trace.spans.every((span) => span.attributes["agentforge.workflow_id"] === "workflow-trace"));
  assert.ok(trace.spans.every((span) => !Object.values(span.attributes).includes("secret requirement must not be traced")));
});
