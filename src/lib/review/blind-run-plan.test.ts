import assert from "node:assert/strict";
import test from "node:test";
import { validateBlindCaseManifest } from "./blind-case-manifest";
import { createBlindRunPlan, validateBlindRunPlan } from "./blind-run-plan";

const manifest = validateBlindCaseManifest({
  schemaVersion: 1,
  protocolVersion: "p2-4-v1",
  frozenAt: "2026-07-19T12:00:00+08:00",
  cases: ["website", "admin", "learning"].flatMap((category, categoryIndex) =>
    Array.from({ length: 4 }, (_, index) => ({
      caseId: `case-${String(categoryIndex * 4 + index + 1).padStart(2, "0")}`,
      category,
      complexity: index % 2 === 0 ? "medium" : "high",
      requirement: `Build a traceable ${category} workflow with roles, recovery, auditability, measurable acceptance criteria, and implementation detail for blind run case ${index}.`,
      acceptanceFocus: ["workflow", "security", "testing"],
    }))
  ),
});

test("blind run plan creates five variants for each of twelve cases", () => {
  const plan = createBlindRunPlan(manifest);
  assert.equal(plan.runs.length, 60);
  assert.equal(new Set(plan.runs.map((run) => run.runId)).size, 60);
  assert.equal(plan.runs.filter((run) => run.caseId === "case-01").length, 5);
});

test("blind run plan rejects a duplicated run id", () => {
  const plan = createBlindRunPlan(manifest);
  plan.runs[1].runId = plan.runs[0].runId;
  assert.throws(() => validateBlindRunPlan(plan), /BLIND_RUN_PLAN_DUPLICATE/);
});
