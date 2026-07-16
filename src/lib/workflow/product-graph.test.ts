import assert from "node:assert/strict";
import test from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import { continueProductWorkflow, createProductWorkflowGraph, resumeProductWorkflow, startProductWorkflow, type ProductWorkflowDependencies } from "./product-graph";

test("workflow pauses for approval and resumes without repeating completed side effects", async () => {
  const calls = { plan: 0, review: 0, approve: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; return { planningArtifactId: "plan-1", status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; return { reviewWorkflowId: "review-1", status: "needs_human" }; },
    approve: async () => { calls.approve += 1; },
    report: async () => { calls.report += 1; return { reportArtifactId: "report-1", status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  const first = await startProductWorkflow({ graph, workflowId: "workflow-1", threadId: "thread-1", userId: "user-1", requirement: "Build a detailed admin portal with roles and audit logs." });

  assert.equal(calls.plan, 1);
  assert.equal(calls.review, 1);
  assert.equal(calls.approve, 0);
  assert.equal(calls.report, 0);
  assert.ok("__interrupt__" in first);

  const completed = await resumeProductWorkflow({ graph, threadId: "thread-1", resume: { kind: "approval", decision: "hybrid", note: "Balance delivery and maintainability." } });
  assert.equal(completed.finalStatus, "completed");
  assert.equal(completed.reportArtifactId, "report-1");
  assert.deepEqual(calls, { plan: 1, review: 1, approve: 1, report: 1 });
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
