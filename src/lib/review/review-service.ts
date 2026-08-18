import type { ExecutionPlan, RequirementAnalysis } from "@/lib/planner/contracts";
import { CandidateSolutionSchema, EvaluationResultSchema, ReviewResultSchema, SimplifiedReviewResultSchema, type CandidateSolution, type EvaluationResult, type Finding, type ReviewBudget, type ReviewResult, type SimplifiedReviewResult, type RubricDimension } from "./contracts";
import { partitionTier1Evidence } from "./evidence-tier1";
import { assessTieredEvidence, type Tier2EvidenceVerifier, type TieredEvidenceAssessment } from "./evidence-tier2";
import { assessPolicyConfidence } from "./intervention-policy";
import { assessCandidateStructuralDiversity, type CandidateDiversityAssessment } from "./candidate-diversity";

export type ReviewWorkflowResult = {
  status: "approved" | "needs_human" | "partial" | "inconclusive";
  candidates: CandidateSolution[];
  review: ReviewResult;
  evaluation: EvaluationResult;
  candidateDiversity: CandidateDiversityAssessment;
  evidenceAssessment: TieredEvidenceAssessment;
  currentRound: number;
  maxRounds: number;
  failures: Array<{ stage: string; code: string }>;
};

export type ReviewGenerators = {
  candidate?: (input: { orientation: "delivery" | "quality"; analysis: RequirementAnalysis; plan: ExecutionPlan }) => Promise<CandidateSolution>;
  review?: (input: { analysis: RequirementAnalysis; plan: ExecutionPlan; candidates: CandidateSolution[]; simplified?: boolean }) => Promise<ReviewResult | SimplifiedReviewResult>;
  evaluate?: (input: { analysis: RequirementAnalysis; plan: ExecutionPlan; candidates: CandidateSolution[]; review: ReviewResult; rubric: RubricDimension[] }) => Promise<EvaluationResult>;
  revise?: (input: { candidate: CandidateSolution; findings: Finding[]; round: number }) => Promise<CandidateSolution>;
  tier2Verifier?: Tier2EvidenceVerifier;
};

export function buildRubric(plan: ExecutionPlan): RubricDimension[] {
  const labels = Array.from(new Set(["需求覆盖", "技术可行性", "成本与交付", "可维护性", "可测试性", ...plan.evaluationDimensions])).slice(0, 12);
  return labels.map((label, index) => ({ id: `rubric-${index + 1}`, label, weight: index < 5 ? 1 : 0.75, minimumScore: 3 }));
}

export function createBaselineCandidate(plan: ExecutionPlan, orientation: "delivery" | "quality"): CandidateSolution {
  const isDelivery = orientation === "delivery";
  return CandidateSolutionSchema.parse({
    schemaVersion: 1,
    id: `candidate-${orientation}`,
    orientation,
    title: isDelivery ? "分阶段快速交付方案" : "质量门禁优先方案",
    summary: isDelivery ? "优先交付最小可验证范围，用短迭代确认需求，再逐步补齐质量能力和运维保障。" : "优先建立权限、数据一致性、测试和可观测性门禁，再按受控批次交付功能。",
    decisions: plan.tasks.slice(0, 6).map((task, index) => ({
      id: `${orientation}-decision-${index + 1}`,
      title: task.title,
      choice: isDelivery ? `先完成 ${task.title} 的最小闭环，并保留后续扩展点。` : `在 ${task.title} 交付前完成异常、测试和维护性约束。`,
      rationale: isDelivery ? "缩短反馈周期并降低错误方向上的前期投入。" : "降低后期返工、数据错误和不可验证交付的概率。",
      tradeoffs: [isDelivery ? "早期质量门禁较少，需要后续偿还技术债。" : "首个可见版本更慢，前期投入和验证成本更高。"],
      evidenceRefs: [`plan-task:${task.id}`, ...task.reportSectionIds.map((id) => `report-section:${id}`)],
    })),
    implementationSteps: plan.tasks.map((task, index) => `${index + 1}. ${task.title}：${task.description}`),
    risks: isDelivery ? ["若缺少明确退出条件，临时简化可能变成长期技术债。"] : ["过多前置门禁可能延迟用户反馈并增加首期成本。"],
    assumptions: ["关键范围、预算和人工确认点以已验证计划为准。"],
    estimatedEffort: isDelivery ? "medium" : "high",
  });
}

export function createBaselineReview(candidates: CandidateSolution[], maxFindings = 20): ReviewResult {
  const delivery = candidates.find((candidate) => candidate.orientation === "delivery");
  const quality = candidates.find((candidate) => candidate.orientation === "quality");
  const findings: Finding[] = [];
  if (delivery) findings.push({ id: "finding-delivery-debt", candidateId: delivery.id, severity: "high", category: "maintainability", failureScenario: "如果最小闭环没有明确补债里程碑，临时权限、测试或数据约束可能直接进入长期运行。", evidenceRefs: [delivery.decisions[0]?.evidenceRefs[0] ?? "plan"], suggestion: "为每项简化设置负责人、截止轮次和升级门禁。", relatedCandidateIds: quality ? [quality.id] : [] });
  if (quality) findings.push({ id: "finding-quality-delay", candidateId: quality.id, severity: "medium", category: "delivery", failureScenario: "如果所有质量门禁都成为首期阻塞项，用户可能在核心流程验证前等待过久。", evidenceRefs: [quality.decisions[0]?.evidenceRefs[0] ?? "plan"], suggestion: "把安全和数据一致性保留为硬门禁，其余质量项按风险分批。", relatedCandidateIds: delivery ? [delivery.id] : [] });
  return ReviewResultSchema.parse({ schemaVersion: 1, findings: findings.slice(0, maxFindings) });
}

function weightedScore(scores: number[], rubric: RubricDimension[]) {
  const weight = rubric.reduce((sum, dimension) => sum + dimension.weight, 0);
  return Number((scores.reduce((sum, score, index) => sum + score * rubric[index].weight, 0) / weight).toFixed(3));
}

export function evaluateBaseline(candidates: CandidateSolution[], review: ReviewResult, rubric: RubricDimension[]): EvaluationResult {
  const { supported, unsupported: ignored } = partitionTier1Evidence(review.findings, candidates);
  const evaluations = candidates.map((candidate) => {
    const base = candidate.orientation === "quality" ? [5, 4, 3, 5, 5] : [4, 4, 5, 3, 3];
    const scores = rubric.map((dimension, index) => ({ dimensionId: dimension.id, score: base[index] ?? 4, rationale: `根据${candidate.orientation === "quality" ? "质量门禁" : "分阶段交付"}方案的明确决策和取舍评分。`, evidenceRefs: candidate.decisions.flatMap((decision) => decision.evidenceRefs).slice(0, 3) }));
    return { candidateId: candidate.id, scores, weightedScore: weightedScore(scores.map((score) => score.score), rubric) };
  });
  const selected = [...evaluations].sort((left, right) => right.weightedScore - left.weightedScore)[0];
  const highFindings = supported.filter((finding) => finding.severity === "blocking" || finding.severity === "high");
  const hasDeliveryQualityConflict = candidates.some((candidate) => candidate.orientation === "delivery") && candidates.some((candidate) => candidate.orientation === "quality") && highFindings.length > 0;
  return EvaluationResultSchema.parse({
    schemaVersion: 1,
    decision: hasDeliveryQualityConflict ? "needs_human" : candidates.length === 0 ? "inconclusive" : "approved",
    selectedCandidateId: hasDeliveryQualityConflict ? null : selected?.candidateId ?? null,
    candidateEvaluations: evaluations,
    supportedFindingIds: supported.map((finding) => finding.id),
    ignoredFindingIds: ignored.map((finding) => finding.id),
    reasons: hasDeliveryQualityConflict ? ["交付速度与长期质量存在高影响取舍，不能由模型静默代替用户决定。"] : ["候选方案达到当前 rubric最低要求。"],
    unresolvedConflicts: hasDeliveryQualityConflict ? [{ id: "conflict-delivery-quality", question: "首期应优先更快验证，还是先完成更严格的质量门禁？", options: ["分阶段快速交付", "质量门禁优先", "安全硬门禁 + 其余分批"], impact: "选择会改变首期时间、成本、技术债和上线风险。", relatedFindingIds: highFindings.map((finding) => finding.id) }] : [],
    nextAction: hasDeliveryQualityConflict ? "等待用户选择并记录理由后再进入报告融合。" : "将选中候选交给 Reporter。",
  });
}

function validateReviewReferences(review: ReviewResult, candidates: CandidateSolution[]) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const findingIds = new Set<string>();
  for (const finding of review.findings) {
    if (findingIds.has(finding.id) || !candidateIds.has(finding.candidateId) || finding.relatedCandidateIds.some((id) => !candidateIds.has(id))) {
      throw new Error("REVIEW_REFERENCES_INVALID");
    }
    findingIds.add(finding.id);
  }
}

function validateEvaluationReferences(evaluation: EvaluationResult, candidates: CandidateSolution[], review: ReviewResult, rubric: RubricDimension[]) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const findingIds = new Set(review.findings.map((finding) => finding.id));
  const dimensionIds = new Set(rubric.map((dimension) => dimension.id));
  if (evaluation.selectedCandidateId && !candidateIds.has(evaluation.selectedCandidateId)) throw new Error("EVALUATION_REFERENCES_INVALID");
  if (evaluation.candidateEvaluations.some((item) => !candidateIds.has(item.candidateId) || item.scores.some((score) => !dimensionIds.has(score.dimensionId)))) throw new Error("EVALUATION_REFERENCES_INVALID");
  if ([...evaluation.supportedFindingIds, ...evaluation.ignoredFindingIds].some((id) => !findingIds.has(id))) throw new Error("EVALUATION_REFERENCES_INVALID");
}

function enforceEvidenceAndHumanGate(
  evaluation: EvaluationResult,
  candidates: CandidateSolution[],
  review: ReviewResult,
  failures: ReviewWorkflowResult["failures"],
) {
  const { supported, unsupported } = partitionTier1Evidence(review.findings, candidates);
  const highImpactConflict = supported.filter((finding) => (finding.severity === "blocking" || finding.severity === "high") && finding.relatedCandidateIds.length > 0);
  const hasBothOrientations = candidates.some((candidate) => candidate.orientation === "delivery") && candidates.some((candidate) => candidate.orientation === "quality");
  const needsHuman = hasBothOrientations && highImpactConflict.length > 0;
  const policyConfidence = assessPolicyConfidence({ evaluation, candidates, supportedFindings: supported, unsupportedFindings: unsupported, failures });
  const recommendsHuman = policyConfidence.intervention === "recommended";
  return EvaluationResultSchema.parse({
    ...evaluation,
    decision: needsHuman || (recommendsHuman && evaluation.decision === "approved") ? "needs_human" : evaluation.decision,
    selectedCandidateId: needsHuman || (recommendsHuman && evaluation.decision === "approved") ? null : evaluation.selectedCandidateId,
    supportedFindingIds: supported.map((finding) => finding.id),
    ignoredFindingIds: unsupported.map((finding) => finding.id),
    policyConfidence,
    reasons: needsHuman && evaluation.decision !== "needs_human"
      ? [...evaluation.reasons, "A supported high-impact cross-candidate conflict requires a recorded human decision."].slice(-20)
      : recommendsHuman && evaluation.decision === "approved"
        ? [...evaluation.reasons, "The policy decision-support signal is low; request a human decision before report synthesis."].slice(-20)
      : evaluation.reasons,
    unresolvedConflicts: needsHuman && evaluation.unresolvedConflicts.length === 0
      ? [{ id: "policy-high-impact-conflict", question: "Which delivery and quality tradeoff should govern the final report?", options: ["delivery", "quality", "hybrid"], impact: "The choice changes schedule, cost, technical debt, and release risk.", relatedFindingIds: highImpactConflict.map((finding) => finding.id) }]
      : evaluation.unresolvedConflicts,
    nextAction: needsHuman || (recommendsHuman && evaluation.decision === "approved") ? "Wait for a recorded human decision before report synthesis." : evaluation.nextAction,
  });
}

export async function runReviewWorkflow(input: { analysis: RequirementAnalysis; plan: ExecutionPlan; budget: ReviewBudget; generators?: ReviewGenerators }): Promise<ReviewWorkflowResult> {
  const orientations = (["delivery", "quality"] as const).slice(0, input.budget.maxCandidates);
  const settled = await Promise.allSettled(orientations.map(async (orientation) => {
    const candidate = CandidateSolutionSchema.parse(await (input.generators?.candidate?.({ orientation, analysis: input.analysis, plan: input.plan }) ?? Promise.resolve(createBaselineCandidate(input.plan, orientation))));
    if (candidate.orientation !== orientation) throw new Error("CANDIDATE_ORIENTATION_INVALID");
    return candidate;
  }));
  const candidates = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = settled.flatMap((result, index) => result.status === "rejected" ? [{ stage: `candidate:${orientations[index]}`, code: "CANDIDATE_FAILED" }] : []);
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    failures.push({ stage: "candidate", code: "CANDIDATE_ID_CONFLICT" });
    candidates.splice(1);
  }
  if (candidates.length === 0) {
    const review = { schemaVersion: 1 as const, findings: [] };
    return {
      status: "inconclusive",
      candidates: [],
      review,
      evaluation: evaluateBaseline([], review, buildRubric(input.plan)),
      candidateDiversity: assessCandidateStructuralDiversity([]),
      evidenceAssessment: await assessTieredEvidence({ findings: [], candidates: [], verifier: input.generators?.tier2Verifier }),
      currentRound: 0,
      maxRounds: input.budget.maxReviewRounds,
      failures,
    };
  }
  let review: ReviewResult;
  let shouldSkipRevision = false;  // 快速通道标志
  try {
    const reviewOutput = await (input.generators?.review?.({ analysis: input.analysis, plan: input.plan, candidates, simplified: true }) ?? Promise.resolve(createBaselineReview(candidates, input.budget.maxFindings)));
    // 将 SimplifiedReviewResult 转换为 ReviewResult
    if ('overallAssessment' in reviewOutput) {
      // 快速通道：如果评估为无重大问题且findings为空，可跳过修订轮次
      const simplified = reviewOutput as SimplifiedReviewResult;
      if (simplified.overallAssessment === "no_major_issues" && simplified.findings.length === 0) {
        shouldSkipRevision = true;
      }
      review = {
        schemaVersion: 1,
        findings: simplified.findings.map(f => ({
          id: f.id,
          candidateId: f.candidateId,
          severity: f.severity,
          category: 'general',
          failureScenario: f.description,
          evidenceRefs: [],
          suggestion: f.description,
          relatedCandidateIds: [],
        })),
      };
    } else {
      review = reviewOutput as ReviewResult;
    }
    validateReviewReferences(review, candidates);
  } catch {
    failures.push({ stage: "review", code: "REVIEW_FAILED" });
    review = { schemaVersion: 1, findings: [] };
  }
  const rubric = buildRubric(input.plan);
  let evaluation: EvaluationResult;
  try {
    evaluation = EvaluationResultSchema.parse(await (input.generators?.evaluate?.({ analysis: input.analysis, plan: input.plan, candidates, review, rubric }) ?? Promise.resolve(evaluateBaseline(candidates, review, rubric))));
    validateEvaluationReferences(evaluation, candidates, review, rubric);
    evaluation = enforceEvidenceAndHumanGate(evaluation, candidates, review, failures);
  } catch {
    failures.push({ stage: "evaluate", code: "EVALUATOR_FAILED" });
    evaluation = enforceEvidenceAndHumanGate(evaluateBaseline(candidates, review, rubric), candidates, review, failures);
  }
  let currentRound = 0;
  while (evaluation.decision === "needs_revision" && !shouldSkipRevision && currentRound < input.budget.maxReviewRounds && input.generators?.revise && candidates[0]) {
    currentRound += 1;
    try {
      const original = candidates[0];
      // 修订只接收 supportedFindingIds（通过证据校验的 finding），不接收全部 finding。
      const supportedFindings = review.findings.filter((finding) => finding.candidateId === original.id && evaluation.supportedFindingIds.includes(finding.id));
      const revised = CandidateSolutionSchema.parse(await input.generators.revise({ candidate: original, findings: supportedFindings, round: currentRound }));
      if (revised.id !== original.id || revised.orientation !== original.orientation) throw new Error("REVISION_IDENTITY_CHANGED");
      candidates[0] = revised;
      // 修订后重新执行 Reviewer → Evaluator，防止修订引入新问题而未被再次检查。
      try {
        const reviewOutput = await (input.generators.review?.({ analysis: input.analysis, plan: input.plan, candidates, simplified: true }) ?? Promise.resolve(createBaselineReview(candidates, input.budget.maxFindings)));
        // 将 SimplifiedReviewResult 转换为 ReviewResult
        if ('overallAssessment' in reviewOutput) {
          const simplified = reviewOutput as SimplifiedReviewResult;
          review = {
            schemaVersion: 1,
            findings: simplified.findings.map(f => ({
              id: f.id,
              candidateId: f.candidateId,
              severity: f.severity,
              category: 'general',
              failureScenario: f.description,
              evidenceRefs: [],
              suggestion: f.description,
              relatedCandidateIds: [],
            })),
          };
        } else {
          review = reviewOutput as ReviewResult;
        }
        validateReviewReferences(review, candidates);
      } catch {
        failures.push({ stage: `revision:${currentRound}:review`, code: "REVIEW_AFTER_REVISION_FAILED" });
        review = { schemaVersion: 1, findings: [] };
      }
      evaluation = EvaluationResultSchema.parse(await (input.generators.evaluate?.({ analysis: input.analysis, plan: input.plan, candidates, review, rubric }) ?? Promise.resolve(evaluateBaseline(candidates, review, rubric))));
      validateEvaluationReferences(evaluation, candidates, review, rubric);
      evaluation = enforceEvidenceAndHumanGate(evaluation, candidates, review, failures);
    } catch {
      failures.push({ stage: `revision:${currentRound}`, code: "REVISION_FAILED" });
      break;
    }
  }
  const status = failures.length > 0 ? "partial" : evaluation.decision === "needs_human" ? "needs_human" : evaluation.decision === "approved" ? "approved" : "inconclusive";
  // Tier 2 目前只提供可审计的语义验证披露，不在未校准前改变既有审批和人工门禁。
  const evidenceAssessment = await assessTieredEvidence({ findings: review.findings, candidates, verifier: input.generators?.tier2Verifier });
  return { status, candidates, review, evaluation, candidateDiversity: assessCandidateStructuralDiversity(candidates), evidenceAssessment, currentRound, maxRounds: input.budget.maxReviewRounds, failures };
}
