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
  assert.equal(result.status, "needs_human", JSON.stringify(result.failures));
  assert.equal(result.evaluation.unresolvedConflicts.length, 1);
  // 共享同一执行计划会带来结构重合；这里记录真实信号，不把角色名当成多样性证明。
  assert.equal(result.candidateDiversity.status, "limited");
  assert.equal(result.evidenceAssessment.status, "not_configured");
  assert.equal(result.evidenceAssessment.effectiveSupportKind, "tier1_structural");
});

test("configured Tier 2 evidence is disclosed without changing the existing human gate", async () => {
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    tier2Verifier: async () => ({ label: "entailed", reason: "The cited candidate decision directly supports this finding." }),
  } });
  assert.equal(result.status, "needs_human");
  assert.equal(result.evaluation.decision, "needs_human");
  assert.equal(result.evidenceAssessment.status, "verified");
  assert.deepEqual(result.evidenceAssessment.effectiveSupportedFindingIds, result.review.findings.map((finding) => finding.id));
  assert.equal(result.evidenceAssessment.effectiveSupportKind, "tier2_semantic");
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

test("revision only receives supported findings and re-runs reviewer after revision", async () => {
  const revisionBudget = ReviewBudgetSchema.parse({ maxCandidates: 1, maxReviewRounds: 2 });
  const baseline = await runReviewWorkflow({ analysis, plan, budget: revisionBudget });
  let reviseFindings: string[] = [];
  let reviewAfterRevisionCalls = 0;
  const candidateId = baseline.candidates[0]?.id ?? "x";
  await runReviewWorkflow({ analysis, plan, budget: revisionBudget, generators: {
    candidate: async ({ orientation }) => ({ ...baseline.candidates.find((candidate) => candidate.orientation === orientation)!, decisions: baseline.candidates[0].decisions.map((d) => ({ ...d, evidenceRefs: ["plan_task:t1"] })) }),
    review: async (input) => {
      if (input.candidates[0]?.summary.includes("已修订")) reviewAfterRevisionCalls += 1;
      return { schemaVersion: 1, findings: [{ id: "f1", candidateId, category: "test", severity: "medium", failureScenario: "测试场景描述长度足够。", suggestion: "测试建议长度足够。", evidenceRefs: ["plan_task:t1"], relatedCandidateIds: [] }] };
    },
    evaluate: async (input) => {
      const supportedIds = input.review.findings.length > 0 ? ["f1"] : [];
      return { schemaVersion: 1, decision: "needs_revision" as const, selectedCandidateId: candidateId, candidateEvaluations: [{ candidateId, scores: [{ dimensionId: "rubric-1", score: 3, rationale: "test rationale", evidenceRefs: [] }, { dimensionId: "rubric-2", score: 3, rationale: "test rationale two", evidenceRefs: [] }], weightedScore: 3 }], supportedFindingIds: supportedIds, ignoredFindingIds: [], unresolvedConflicts: [], reasons: ["需要修订的原因长度足够。"], nextAction: "修订候选方案。" };
    },
    revise: async ({ findings, candidate }) => {
      reviseFindings = findings.map((f) => f.id);
      return { ...candidate, summary: `${candidate.summary} 已修订` };
    },
  } });
  // 修订只接收 supportedFindingIds（f1），不接收全部 finding
  assert.deepEqual(reviseFindings, ["f1"]);
  // 修订后 Reviewer 被再次调用
  assert.ok(reviewAfterRevisionCalls >= 1, "Reviewer should run after revision");
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
  assert.equal(result.evaluation.policyConfidence?.level, "low");
  assert.equal(result.evaluation.policyConfidence?.intervention, "required");
  assert.deepEqual(result.evaluation.policyConfidence?.failedStages, ["evaluate"]);
});

test("Evaluator cannot silently approve a supported high-impact cross-candidate conflict", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    evaluate: async () => ({
      ...baseline.evaluation,
      decision: "approved" as const,
      selectedCandidateId: baseline.candidates[0].id,
      supportedFindingIds: [],
      ignoredFindingIds: [],
      unresolvedConflicts: [],
      nextAction: "Send the chosen candidate directly to the Reporter.",
    }),
  } });
  assert.equal(result.status, "needs_human");
  assert.equal(result.evaluation.decision, "needs_human");
  assert.equal(result.evaluation.selectedCandidateId, null);
  assert.equal(result.evaluation.unresolvedConflicts.length, 1);
  assert.equal(result.evaluation.policyConfidence?.hardHumanGate, true);
  assert.equal(result.evaluation.policyConfidence?.intervention, "required");
});

test("low policy decision-support signal recommends human review without claiming model confidence", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const result = await runReviewWorkflow({ analysis, plan, budget, generators: {
    review: async () => ({
      schemaVersion: 1 as const,
      findings: [
        { id: "unsupported-a", candidateId: baseline.candidates[0].id, severity: "low" as const, category: "opinion", failureScenario: "没有可验证引用的意见不应被当作已支持的结论。", evidenceRefs: [], suggestion: "补充可验证来源。", relatedCandidateIds: [] },
        { id: "unsupported-b", candidateId: baseline.candidates[1].id, severity: "low" as const, category: "opinion", failureScenario: "第二条没有可验证引用的意见也应保留为未支持。", evidenceRefs: [], suggestion: "补充可验证来源。", relatedCandidateIds: [] },
      ],
    }),
    evaluate: async () => ({
      ...baseline.evaluation,
      decision: "approved" as const,
      selectedCandidateId: baseline.candidates[0].id,
      supportedFindingIds: [],
      ignoredFindingIds: [],
      unresolvedConflicts: [],
      reasons: ["当前候选可直接进入报告。"],
      nextAction: "生成报告。",
    }),
  } });
  assert.equal(result.status, "needs_human");
  assert.equal(result.evaluation.decision, "needs_human");
  assert.equal(result.evaluation.policyConfidence?.kind, "policy_decision_support");
  assert.equal(result.evaluation.policyConfidence?.hardHumanGate, false);
  assert.equal(result.evaluation.policyConfidence?.intervention, "recommended");
  assert.ok((result.evaluation.policyConfidence?.score ?? 1) < 0.4);
});
