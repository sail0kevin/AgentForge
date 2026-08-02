import type { CandidateSolution, EvaluationResult, Finding, PolicyConfidenceAssessment } from "./contracts";

type WorkflowFailure = { stage: string; code: string };

const severityImpact = {
  blocking: 1,
  high: 0.8,
  medium: 0.35,
  low: 0.15,
} as const;

function rounded(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

/**
 * 只从当前评审中已经验证的结构事实生成干预建议。
 * 它不能衡量模型是否“理解正确”，因此不得用于声明模型质量或校准效果。
 */
export function assessPolicyConfidence(input: {
  evaluation: EvaluationResult;
  candidates: CandidateSolution[];
  supportedFindings: Finding[];
  unsupportedFindings: Finding[];
  failures: WorkflowFailure[];
}): PolicyConfidenceAssessment {
  const evidenceTotal = input.supportedFindings.length + input.unsupportedFindings.length;
  const evidenceSupportRatio = rounded(evidenceTotal === 0 ? 1 : input.supportedFindings.length / evidenceTotal);
  const scores = input.evaluation.candidateEvaluations.map((item) => item.weightedScore).sort((left, right) => right - left);
  const scoreMarginRatio = rounded(scores.length >= 2 ? Math.abs(scores[0] - scores[1]) / 5 : 0);
  const highest = input.supportedFindings
    .map((finding) => finding.severity)
    .sort((left, right) => severityImpact[right] - severityImpact[left])[0] ?? null;
  const hasBothOrientations = input.candidates.some((candidate) => candidate.orientation === "delivery")
    && input.candidates.some((candidate) => candidate.orientation === "quality");
  const hardHumanGate = hasBothOrientations && input.supportedFindings.some((finding) => (
    (finding.severity === "blocking" || finding.severity === "high") && finding.relatedCandidateIds.length > 0
  ));
  const failurePenalty = input.failures.length > 0 ? 1 : 0;
  const score = rounded(failurePenalty > 0
    ? 0
    : evidenceSupportRatio * 0.5 + scoreMarginRatio * 0.3 + (1 - (highest ? severityImpact[highest] : 0)) * 0.2);
  const level = score > 0.8 ? "high" : score < 0.4 ? "low" : "medium";
  const intervention = hardHumanGate ? "required" : score < 0.4 ? "recommended" : "not_required";
  const reasons = [
    `证据支持比例为 ${evidenceSupportRatio}。`,
    `候选加权分差比例为 ${scoreMarginRatio}。`,
    ...(highest ? [`最高已支持 Finding 严重度为 ${highest}。`] : ["没有已支持的 Finding。"]),
    ...(input.failures.length > 0 ? [`存在失败阶段：${input.failures.map((failure) => failure.stage).join(", ")}。`] : []),
    ...(hardHumanGate ? ["已支持的高影响跨候选冲突触发强制人工裁决。"] : []),
  ];
  return { kind: "policy_decision_support", score, level, evidenceSupportRatio, scoreMarginRatio, highestSupportedFindingSeverity: highest, failedStages: input.failures.map((failure) => failure.stage), hardHumanGate, intervention, reasons };
}
