import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "./contracts";
import { createBaselineReview, evaluateBaseline, runReviewWorkflow, buildRubric } from "./review-service";

const analysis = analyzeRequirementBaseline("为运营管理员开发订单管理后台，需要角色权限、状态流转、审计和查询筛选。");
const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
const budget = ReviewBudgetSchema.parse({});

test("delivery and quality candidates are independently created and expose their tradeoff", async () => {
  const seen: Array<{ orientation: string; keys: string[] }> = [];
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    candidate: async (input) => {
      seen.push({ orientation: input.orientation, keys: Object.keys(input) });
      return baseline.candidates.find((candidate) => candidate.orientation === input.orientation)!;
    },
  } });
  assert.deepEqual(seen.map((item) => item.orientation), ["delivery", "quality"]);
  assert.ok(seen.every((item) => !item.keys.includes("candidates")));
  assert.equal(result.status, "needs_human");
  assert.equal(result.evaluation.unresolvedConflicts.length, 1);
});

test("unsupported findings never become blocking evidence", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const review = createBaselineReview(baseline.candidates);
  review.findings.push({ id: "unsupported", candidateId: baseline.candidates[0].id, severity: "blocking", category: "opinion", failureScenario: "这个方案可能不好，但没有提供任何可以验证的证据。", evidenceRefs: [], suggestion: "提供证据后重新评审。", relatedCandidateIds: [] });
  const evaluation = evaluateBaseline(baseline.candidates, review, buildRubric(plan));
  assert.ok(evaluation.ignoredFindingIds.includes("unsupported"));
  assert.ok(!evaluation.supportedFindingIds.includes("unsupported"));
});

test("one failed proposer produces partial instead of fabricated success", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    candidate: async ({ orientation }) => {
      if (orientation === "delivery") throw new Error("provider failed");
      return baseline.candidates.find((candidate) => candidate.orientation === orientation)!;
    },
  } });
  assert.equal(result.status, "partial");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.failures, [{ stage: "candidate:delivery", code: "CANDIDATE_FAILED" }]);
});

test("revision loop stops after the configured maximum round", async () => {
  const revisionBudget = ReviewBudgetSchema.parse({ maxCandidates: 1, maxReviewRounds: 1 });
  const baseline = await runReviewWorkflow({ analysis, plan, budget: revisionBudget });
  let evaluations = 0;
  let revisions = 0;
  const result = await runReviewWorkflow({ analysis, plan, budget: revisionBudget, generators: {
    candidate: async ({ orientation }) => baseline.candidates.find((candidate) => candidate.orientation === orientation)!,
    evaluate: async () => {
      evaluations += 1;
      return { ...baseline.evaluation, decision: "needs_revision" as const, unresolvedConflicts: [], reasons: ["需要一次定点修订后再评价。"], nextAction: "修订候选方案。" };
    },
    revise: async ({ candidate }) => { revisions += 1; return { ...candidate, summary: `${candidate.summary} 已按有证据的 finding完成一次定点修订。` }; },
  } });
  assert.equal(result.currentRound, 1);
  assert.equal(revisions, 1);
  assert.equal(evaluations, 2);
});

test("reviewer failure is explicit partial output and never fabricated as full success", async () => {
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    review: async () => { throw new Error("review provider unavailable"); },
  } });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.review.findings, []);
  assert.ok(result.failures.some((failure) => failure.code === "REVIEW_FAILED"));
});

test("evaluator failure falls back to a labelled partial result", async () => {
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    evaluate: async () => { throw new Error("evaluator provider unavailable"); },
  } });
  assert.equal(result.status, "partial");
  assert.ok(result.failures.some((failure) => failure.code === "EVALUATOR_FAILED"));
  assert.ok(result.evaluation.candidateEvaluations.length > 0);
});

test("Evaluator cannot silently approve a supported high-impact cross-candidate conflict", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    evaluate: async () => ({
      ...baseline.evaluation,
      decision: "approved" as const,
      selectedCandidateId: baseline.candidates[0].id,
      unresolvedConflicts: [],
      nextAction: "Send the chosen candidate directly to the Reporter.",
    }),
  } });
  assert.equal(result.status, "needs_human");
  assert.equal(result.evaluation.decision, "needs_human");
  assert.equal(result.evaluation.selectedCandidateId, null);
  assert.equal(result.evaluation.unresolvedConflicts.length, 1);
});
