import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ABLATION_VARIANTS, runAblationArm, runCaseComparison, runMultiAgentArm, runSingleAgentArm, type CallModel } from "./agent-comparison";
import { ABLATION_ARM_MAXIMUM_CALLS } from "./ablation-budget";
import { ReviewBudgetSchema } from "./contracts";
import { buildRubric, createBaselineCandidate, createBaselineReview, evaluateBaseline } from "./review-service";
import type { LightweightCase } from "./lightweight-case-manifest";

const adminRequirement = "开发一个给运营管理员使用的订单管理后台，需要角色权限、查询筛选、状态流转和审计记录。";

function buildDeliveryOnlyMultiAgentCallModel(): CallModel {
  const analysis = analyzeRequirementBaseline(adminRequirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const deliveryCandidate = createBaselineCandidate(plan, "delivery");
  const review = createBaselineReview([deliveryCandidate]);
  const evaluation = evaluateBaseline([deliveryCandidate], review, [
    { id: "rubric-1", label: "需求覆盖", weight: 1, minimumScore: 3 },
    { id: "rubric-2", label: "技术可行性", weight: 1, minimumScore: 3 },
  ]);

  return async (roleId) => {
    if (roleId === "planner:analysis") return { content: JSON.stringify(analysis), inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:plan") return { content: JSON.stringify(plan), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:delivery") return { content: JSON.stringify(deliveryCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "review") return { content: JSON.stringify(review), inputTokens: 10, outputTokens: 10 };
    if (roleId === "evaluate") return { content: JSON.stringify(evaluation), inputTokens: 10, outputTokens: 10 };
    throw new Error(`unexpected roleId in test fake: ${roleId}`);
  };
}

function buildAblationCallModel(calls: string[]): CallModel {
  const analysis = analyzeRequirementBaseline(adminRequirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const deliveryCandidate = createBaselineCandidate(plan, "delivery");
  const qualityCandidate = createBaselineCandidate(plan, "quality");
  const review = createBaselineReview([deliveryCandidate, qualityCandidate]);
  const evaluation = evaluateBaseline([deliveryCandidate, qualityCandidate], review, [
    { id: "rubric-1", label: "需求覆盖", weight: 1, minimumScore: 3 },
    { id: "rubric-2", label: "技术可行性", weight: 1, minimumScore: 3 },
  ]);

  return async (roleId) => {
    calls.push(roleId);
    if (roleId === "single-agent") return { content: "single agent solution", inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:analysis") return { content: JSON.stringify(analysis), inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:plan") return { content: JSON.stringify(plan), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:delivery") return { content: JSON.stringify(deliveryCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:quality") return { content: JSON.stringify(qualityCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "review") return { content: JSON.stringify(review), inputTokens: 10, outputTokens: 10 };
    if (roleId === "evaluate") return { content: JSON.stringify(evaluation), inputTokens: 10, outputTokens: 10 };
    throw new Error(`unexpected roleId in ablation fake: ${roleId}`);
  };
}

test("four frozen ablation variants use the intended agent topology", async () => {
  assert.deepEqual(ABLATION_VARIANTS, [
    "single_agent",
    "dual_candidate_no_review",
    "single_candidate_with_review",
    "full_multi_agent",
  ]);

  const expectations = [
    { variant: "single_agent" as const, expectedCalls: ["single-agent"], candidateCount: 0, reviewExecuted: false },
    { variant: "dual_candidate_no_review" as const, expectedCalls: ["planner:analysis", "planner:plan", "candidate:delivery", "candidate:quality"], candidateCount: 2, reviewExecuted: false },
    { variant: "single_candidate_with_review" as const, expectedCalls: ["planner:analysis", "planner:plan", "candidate:delivery", "review", "evaluate"], candidateCount: 1, reviewExecuted: true },
    { variant: "full_multi_agent" as const, expectedCalls: ["planner:analysis", "planner:plan", "candidate:delivery", "candidate:quality", "review", "evaluate"], candidateCount: 2, reviewExecuted: true },
  ];

  for (const expectation of expectations) {
    const calls: string[] = [];
    const result = await runAblationArm({
      variant: expectation.variant,
      requirement: adminRequirement,
      callModel: buildAblationCallModel(calls),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.candidateCount, expectation.candidateCount);
    assert.equal(result.reviewExecuted, expectation.reviewExecuted);
    assert.equal(result.evaluatorExecuted, expectation.reviewExecuted);
    assert.deepEqual([...calls].sort(), [...expectation.expectedCalls].sort());

    if (expectation.variant === "dual_candidate_no_review") {
      assert.equal(result.selectedCandidateId, null);
      assert.equal(result.decision, null);
      assert.match(result.solutionText ?? "", /\[delivery\]/);
      assert.match(result.solutionText ?? "", /\[quality\]/);
    }
  }
});

test("runSingleAgentArm returns the model's raw content as the solution text", async () => {
  const callModel: CallModel = async (roleId, systemPrompt, userPrompt) => {
    assert.equal(roleId, "single-agent");
    assert.match(systemPrompt, /single senior engineer/i);
    assert.equal(userPrompt, adminRequirement);
    return { content: "one complete solution text", inputTokens: 5, outputTokens: 5 };
  };
  const result = await runSingleAgentArm({ requirement: adminRequirement, callModel });
  assert.equal(result.solutionText, "one complete solution text");
});

test("runMultiAgentArm runs planner then review workflow and renders the selected candidate", async () => {
  const reviewBudget = ReviewBudgetSchema.parse({ maxCandidates: 1 });
  const result = await runMultiAgentArm({
    requirement: adminRequirement,
    callModel: buildDeliveryOnlyMultiAgentCallModel(),
    reviewBudget,
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.reviewStatus, "approved");
    assert.match(result.solutionText, /分阶段快速交付方案/);
    assert.ok(result.selectedCandidateId);
  }
});

test("runMultiAgentArm forces the retry pass forward into planning even if that pass's analysis still lists missing information", async () => {
  const vagueRequirement = "做个网页";
  const vagueAnalysis = analyzeRequirementBaseline(vagueRequirement);
  const plan = createBaselinePlan(vagueAnalysis, DEFAULT_PLANNER_BUDGET);
  const deliveryCandidate = createBaselineCandidate(plan, "delivery");
  const review = createBaselineReview([deliveryCandidate]);
  const evaluation = evaluateBaseline([deliveryCandidate], review, [
    { id: "rubric-1", label: "需求覆盖", weight: 1, minimumScore: 3 },
    { id: "rubric-2", label: "技术可行性", weight: 1, minimumScore: 3 },
  ]);
  let analysisCallCount = 0;
  const callModel: CallModel = async (roleId) => {
    if (roleId === "planner:analysis") {
      analysisCallCount += 1;
      // Same vague analysis both times: the retry still lists missing required info, but bypassClarificationGate must force it forward anyway.
      return { content: JSON.stringify(vagueAnalysis), inputTokens: 5, outputTokens: 5 };
    }
    if (roleId === "planner:assumptions") return { content: "假设：暂无更多可用信息", inputTokens: 5, outputTokens: 5 };
    if (roleId === "planner:plan") return { content: JSON.stringify(plan), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:delivery") return { content: JSON.stringify(deliveryCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "review") return { content: JSON.stringify(review), inputTokens: 10, outputTokens: 10 };
    if (roleId === "evaluate") return { content: JSON.stringify(evaluation), inputTokens: 10, outputTokens: 10 };
    throw new Error(`unexpected roleId in test fake: ${roleId}`);
  };
  const reviewBudget = ReviewBudgetSchema.parse({ maxCandidates: 1 });
  const result = await runMultiAgentArm({ requirement: vagueRequirement, callModel, reviewBudget });
  assert.equal(analysisCallCount, 2);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.assumptionRetryUsed, true);
});

function buildAssumptionRetryMultiAgentCallModel(): CallModel {
  const vagueAnalysis = analyzeRequirementBaseline("做个网页");
  const analysis = analyzeRequirementBaseline(adminRequirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const deliveryCandidate = createBaselineCandidate(plan, "delivery");
  const review = createBaselineReview([deliveryCandidate]);
  const evaluation = evaluateBaseline([deliveryCandidate], review, [
    { id: "rubric-1", label: "需求覆盖", weight: 1, minimumScore: 3 },
    { id: "rubric-2", label: "技术可行性", weight: 1, minimumScore: 3 },
  ]);

  let analysisCallCount = 0;
  return async (roleId) => {
    if (roleId === "planner:analysis") {
      analysisCallCount += 1;
      return { content: JSON.stringify(analysisCallCount === 1 ? vagueAnalysis : analysis), inputTokens: 10, outputTokens: 10 };
    }
    if (roleId === "planner:assumptions") return { content: "假设：目标是承接线上咨询并提升转化率\n假设：主要使用者是访客和内容运营人员", inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:plan") return { content: JSON.stringify(plan), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:delivery") return { content: JSON.stringify(deliveryCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "review") return { content: JSON.stringify(review), inputTokens: 10, outputTokens: 10 };
    if (roleId === "evaluate") return { content: JSON.stringify(evaluation), inputTokens: 10, outputTokens: 10 };
    throw new Error(`unexpected roleId in test fake: ${roleId}`);
  };
}

test("runMultiAgentArm retries once with self-generated assumptions and proceeds when the retry resolves the gap", async () => {
  const reviewBudget = ReviewBudgetSchema.parse({ maxCandidates: 1 });
  const result = await runMultiAgentArm({ requirement: "做个网页", callModel: buildAssumptionRetryMultiAgentCallModel(), reviewBudget });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.assumptionRetryUsed, true);
    assert.equal(result.reviewStatus, "approved");
  }
});

test("ablation maximum-call reserve covers clarification, structured retries, and two review revisions", async () => {
  const vagueAnalysis = analyzeRequirementBaseline("做个网页");
  const resolvedAnalysis = analyzeRequirementBaseline(adminRequirement);
  const plan = createBaselinePlan(resolvedAnalysis, DEFAULT_PLANNER_BUDGET);
  const deliveryCandidate = createBaselineCandidate(plan, "delivery");
  const qualityCandidate = createBaselineCandidate(plan, "quality");
  // 空 Finding 避免证据门禁把评估直接升级为 needs_human，确保覆盖两轮修订路径。
  const review = { schemaVersion: 1 as const, findings: [] };
  const approvedEvaluation = evaluateBaseline([deliveryCandidate, qualityCandidate], review, buildRubric(plan));
  const needsRevisionEvaluation = { ...approvedEvaluation, decision: "needs_revision" as const };
  const calls: string[] = [];
  const attemptsByRole = new Map<string, number>();
  let evaluationPasses = 0;
  const callModel: CallModel = async (roleId) => {
    calls.push(roleId);
    const attempt = (attemptsByRole.get(roleId) ?? 0) + 1;
    attemptsByRole.set(roleId, attempt);
    // 除假设回答外，所有结构化节点都在第一次输出无效内容，覆盖每个节点的两次调用上限。
    if (roleId !== "planner:assumptions" && attempt % 2 === 1) return { content: "not json", inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:analysis") {
      // 首轮第二次才得到合法澄清，第二轮第二次才得到可继续规划的合法分析。
      return { content: JSON.stringify(attempt === 2 ? vagueAnalysis : resolvedAnalysis), inputTokens: 10, outputTokens: 10 };
    }
    if (roleId === "planner:assumptions") return { content: "假设：面向运营管理员使用", inputTokens: 10, outputTokens: 10 };
    if (roleId === "planner:plan") return { content: JSON.stringify(plan), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:delivery" || roleId === "revise:1" || roleId === "revise:2") return { content: JSON.stringify(deliveryCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "candidate:quality") return { content: JSON.stringify(qualityCandidate), inputTokens: 10, outputTokens: 10 };
    if (roleId === "review") return { content: JSON.stringify(review), inputTokens: 10, outputTokens: 10 };
    if (roleId === "evaluate") {
      evaluationPasses += 1;
      return { content: JSON.stringify(evaluationPasses <= 2 ? needsRevisionEvaluation : approvedEvaluation), inputTokens: 10, outputTokens: 10 };
    }
    throw new Error(`unexpected roleId in maximum-call test: ${roleId}`);
  };

  const result = await runAblationArm({
    variant: "full_multi_agent",
    requirement: "做个网页",
    callModel,
    reviewBudget: ReviewBudgetSchema.parse({ maxReviewRounds: 2 }),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.assumptionRetryUsed, true);
  assert.equal(calls.length, ABLATION_ARM_MAXIMUM_CALLS.full_multi_agent);
});

function buildLightweightCase(): LightweightCase {
  return {
    caseId: "lw-case-01",
    category: "internal-admin",
    complexity: "medium",
    requirement: adminRequirement,
    checklist: [
      { id: "point-1", description: "覆盖角色权限", keywords: ["权限"], isConstraint: false },
      { id: "point-2", description: "覆盖审计记录", keywords: ["审计"], isConstraint: false },
      { id: "point-3", description: "覆盖状态流转", keywords: ["状态流转"], isConstraint: false },
      { id: "point-4", description: "覆盖查询筛选", keywords: ["筛选"], isConstraint: false },
      { id: "point-5", description: "覆盖并发处理", keywords: ["并发"], isConstraint: true },
    ],
  };
}

test("runCaseComparison keeps one arm's failure from masking the other arm's real result", async () => {
  const failingSingleAgentCallModel: CallModel = async () => {
    throw new Error("LONGCAT_TIMEOUT");
  };
  const reviewBudget = ReviewBudgetSchema.parse({ maxCandidates: 1 });
  const result = await runCaseComparison({
    testCase: buildLightweightCase(),
    singleAgentCallModel: failingSingleAgentCallModel,
    multiAgentCallModel: buildDeliveryOnlyMultiAgentCallModel(),
    reviewBudget,
  });
  assert.equal(result.singleAgent.status, "error");
  if (result.singleAgent.status === "error") assert.match(result.singleAgent.error, /LONGCAT_TIMEOUT/);
  assert.equal(result.multiAgent.status, "ready");
});

test("runCaseComparison reports a multi-agent error independently of a healthy single-agent arm", async () => {
  const healthySingleAgentCallModel: CallModel = async () => ({ content: "single agent solution", inputTokens: 5, outputTokens: 5 });
  const failingMultiAgentCallModel: CallModel = async () => {
    throw new Error("LONGCAT_INVALID_RESPONSE");
  };
  const result = await runCaseComparison({
    testCase: buildLightweightCase(),
    singleAgentCallModel: healthySingleAgentCallModel,
    multiAgentCallModel: failingMultiAgentCallModel,
  });
  assert.equal(result.singleAgent.status, "ok");
  if (result.singleAgent.status === "ok") assert.equal(result.singleAgent.solutionText, "single agent solution");
  assert.equal(result.multiAgent.status, "error");
});
