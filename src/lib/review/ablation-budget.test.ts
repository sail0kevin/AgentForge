import assert from "node:assert/strict";
import test from "node:test";
import { estimateAblationBudget } from "./ablation-budget";
import { createAblationRunPlan } from "./ablation-protocol";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";

function plan() {
  return createAblationRunPlan(validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-08-01T00:00:00+08:00",
    cases: Array.from({ length: 20 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "Build a representative requirement-planning case with roles, scope, acceptance criteria, constraints, audit records, error handling, performance goals, and operations.",
      checklist: Array.from({ length: 5 }, (_, point) => ({ id: `point-${point + 1}`, description: `Checklist point ${point + 1}`, keywords: [`keyword-${point + 1}`], isConstraint: false })),
    })),
  }), 1, 20260801);
}

test("ablation budget reserves both frozen input and output limits for every maximum call", () => {
  const budget = estimateAblationBudget({ plan: plan(), maxEstimatedInputTokens: 16_000, maxOutputTokens: 12_000 });
  const full = budget.arms.find((arm) => arm.variant === "full_multi_agent");
  assert.deepEqual(full, {
    variant: "full_multi_agent",
    maximumCalls: 23,
    runCount: 20,
    maxEstimatedInputTokensPerRun: 368_000,
    maxOutputTokensPerRun: 276_000,
    reserveUsd: 1.0902,
  });
  assert.equal(budget.minimumPerRunUsd, 1.0902);
  assert.equal(budget.minimumTotalUsd, 54.984);
});
