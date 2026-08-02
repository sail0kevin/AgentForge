import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "./baseline-planner";
import { applyIncrementalApprovalPatch } from "./incremental-approval";
import { DEFAULT_PLANNER_BUDGET } from "./planner-service";

function plan() {
  return createBaselinePlan(analyzeRequirementBaseline("Build an admin portal with user roles, audit records, approval flow, accessibility, and staged delivery."), DEFAULT_PLANNER_BUDGET);
}

test("incremental approval changes only existing task fields and recalculates estimates", () => {
  const original = plan();
  const first = original.tasks[0];
  const result = applyIncrementalApprovalPatch(original, {
    schemaVersion: 1,
    taskEdits: [{ taskId: first.id, title: "已人工调整的任务", estimatedTokens: first.estimatedTokens + 100 }],
  });
  assert.equal(result.plan.tasks[0].title, "已人工调整的任务");
  assert.equal(result.plan.estimatedTotalTokens, original.estimatedTotalTokens + 100);
  assert.notEqual(result.originalPlanSha256, result.amendedPlanSha256);
  assert.deepEqual(result.plan.reportSections, original.reportSections);
});

test("incremental approval rejects unknown tasks and invalid dependency graphs", () => {
  const original = plan();
  assert.throws(() => applyIncrementalApprovalPatch(original, { schemaVersion: 1, taskEdits: [{ taskId: "missing", title: "不存在的任务" }] }), /APPROVAL_PATCH_TASK_NOT_FOUND/);
  assert.throws(() => applyIncrementalApprovalPatch(original, {
    schemaVersion: 1,
    taskEdits: [{ taskId: original.tasks[0].id, dependsOn: [original.tasks[0].id] }],
  }), /APPROVAL_PATCH_PLAN_INVALID/);
});
