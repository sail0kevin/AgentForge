import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { assessCandidateStructuralDiversity } from "./candidate-diversity";
import { createBaselineCandidate } from "./review-service";

const plan = createBaselinePlan(analyzeRequirementBaseline("Build an order admin portal with roles, audit history, search, and phased delivery."), DEFAULT_PLANNER_BUDGET);

test("structural diversity distinguishes duplicated candidates from different role baselines", () => {
  const delivery = createBaselineCandidate(plan, "delivery");
  const duplicate = { ...delivery, id: "candidate-quality-copy", orientation: "quality" as const };
  const copied = assessCandidateStructuralDiversity([delivery, duplicate]);
  const independent = assessCandidateStructuralDiversity([delivery, createBaselineCandidate(plan, "quality")]);

  assert.equal(copied.status, "limited");
  assert.equal(copied.score, 0);
  assert.equal(independent.status, "limited");
  assert.ok(independent.score > copied.score);
  assert.equal(independent.orientationCoverage, 1);
  assert.match(independent.limitations[0], /does not establish semantic diversity/);
});

test("one candidate is explicitly not applicable instead of receiving a diversity claim", () => {
  const result = assessCandidateStructuralDiversity([createBaselineCandidate(plan, "delivery")]);
  assert.equal(result.status, "not_applicable");
  assert.equal(result.score, 0);
  assert.equal(result.orientationCoverage, 0.5);
});
