import assert from "node:assert/strict";
import test from "node:test";
import { pairedBootstrapDelta } from "./ablation-statistics";
import { createAblationRunPlan, validateAblationRunPlan } from "./ablation-protocol";
import { hashAblationJson } from "./ablation-results";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";

function manifest() {
  return validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-07-30T00:00:00+08:00",
    cases: Array.from({ length: 20 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "设计一个面向企业员工的业务网站，明确用户角色、业务范围、验收标准、数据约束、权限控制、审计记录、异常处理、性能目标与上线后的运维要求。",
      checklist: Array.from({ length: 5 }, (_, checklistIndex) => ({ id: `point-${checklistIndex}`, description: `覆盖关键点 ${checklistIndex}`, keywords: [`关键点${checklistIndex}`], isConstraint: false })),
    })),
  });
}

test("ablation protocol freezes a complete four-arm matrix for every case and trial", () => {
  const plan = createAblationRunPlan(manifest(), 3, 9);
  assert.equal(plan.runs.length, 20 * 3 * 4);
  assert.equal(plan.executionOrderSeed, 9);
  assert.deepEqual(plan.variants, ["single_agent", "dual_candidate_no_review", "single_candidate_with_review", "full_multi_agent"]);
  assert.equal(new Set(plan.runs.map((run) => run.runId)).size, plan.runs.length);

  const broken = structuredClone(plan);
  broken.runs = broken.runs.filter((run) => run.variant !== "full_multi_agent");
  assert.throws(() => validateAblationRunPlan(broken), /ABLATION_RUN_MATRIX_INVALID|ABLATION_VARIANT_SET_INVALID/);
});

test("ablation protocol uses the documented frozen seed when no seed is supplied", () => {
  const plan = createAblationRunPlan(manifest(), 1);
  assert.equal(plan.executionOrderSeed, 20260801);
});

test("ablation protocol freezes a deterministic but non-fixed arm order in each paired block", () => {
  const fixed = createAblationRunPlan(manifest(), 2, 19);
  const repeated = createAblationRunPlan(manifest(), 2, 19);
  const anotherSeed = createAblationRunPlan(manifest(), 2, 20);
  assert.deepEqual(fixed.runs, repeated.runs);
  assert.notDeepEqual(fixed.runs, anotherSeed.runs);

  for (const runs of Object.values(Object.groupBy(fixed.runs, (run) => `${run.caseId}:${run.trial}`))) {
    assert.deepEqual([...runs!].map((run) => run.variant).sort(), [...fixed.variants].sort());
  }
});

test("ablation plan fingerprint is stable across serialized plan formatting", () => {
  const plan = createAblationRunPlan(manifest(), 2, 20260801);
  const parsedWithDifferentFormatting = JSON.parse(JSON.stringify(plan, null, 4));

  // 授权绑定的是解析后的冻结对象，不依赖文件的换行符或缩进格式。
  assert.equal(hashAblationJson(parsedWithDifferentFormatting), hashAblationJson(plan));
});

test("paired bootstrap reports exclusions instead of treating failed runs as zero", () => {
  const observations = [
    { caseId: "a", trial: 1, variant: "single_agent", value: 0.5 },
    { caseId: "a", trial: 1, variant: "full_multi_agent", value: 0.7 },
    { caseId: "b", trial: 1, variant: "single_agent", value: 0.6 },
    { caseId: "b", trial: 1, variant: "full_multi_agent", value: null },
    { caseId: "c", trial: 1, variant: "single_agent", value: 0.4 },
    { caseId: "c", trial: 1, variant: "full_multi_agent", value: 0.5 },
  ];
  const summary = pairedBootstrapDelta({ observations, baselineVariant: "single_agent", treatmentVariant: "full_multi_agent", resamples: 500, seed: 7 });
  assert.equal(summary.pairCount, 2);
  assert.equal(summary.excludedPairCount, 1);
  assert.equal(summary.meanDelta, 0.15);
  assert.deepEqual(summary, pairedBootstrapDelta({ observations, baselineVariant: "single_agent", treatmentVariant: "full_multi_agent", resamples: 500, seed: 7 }));
});
