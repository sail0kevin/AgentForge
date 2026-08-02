import type { CandidateSolution } from "./contracts";

export type CandidateDiversityAssessment = {
  kind: "structural_candidate_diversity";
  status: "not_applicable" | "limited" | "sufficient";
  candidateIds: string[];
  orientationCoverage: number;
  sharedDecisionTitleRatio: number;
  matchedDecisionChoiceRatio: number;
  implementationStepOverlapRatio: number;
  riskOverlapRatio: number;
  assumptionOverlapRatio: number;
  sharedEvidenceReferenceRatio: number;
  score: number;
  reasons: string[];
  limitations: string[];
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function overlapRatio(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normalize).filter(Boolean));
  const rightSet = new Set(right.map(normalize).filter(Boolean));
  const union = new Set([...leftSet, ...rightSet]);
  const intersection = [...leftSet].filter((value) => rightSet.has(value));
  return ratio(intersection.length, union.size);
}

/**
 * 仅从已结构化的候选内容计算可审计的差异信号。
 * 不把词面差异当作语义多样性，也不推断候选质量或独立思考程度。
 */
export function assessCandidateStructuralDiversity(candidates: CandidateSolution[]): CandidateDiversityAssessment {
  const candidateIds = candidates.map((candidate) => candidate.id);
  const orientations = new Set(candidates.map((candidate) => candidate.orientation));
  if (candidates.length < 2) {
    return {
      kind: "structural_candidate_diversity",
      status: "not_applicable",
      candidateIds,
      orientationCoverage: ratio(orientations.size, 2),
      sharedDecisionTitleRatio: 0,
      matchedDecisionChoiceRatio: 0,
      implementationStepOverlapRatio: 0,
      riskOverlapRatio: 0,
      assumptionOverlapRatio: 0,
      sharedEvidenceReferenceRatio: 0,
      score: 0,
      reasons: ["Fewer than two candidates are available, so candidate diversity cannot be assessed."],
      limitations: ["This is not a semantic or model-behavior measurement."],
    };
  }

  const [left, right] = candidates;
  const leftDecisionTitles = left.decisions.map((decision) => decision.title);
  const rightDecisionTitles = right.decisions.map((decision) => decision.title);
  const sharedDecisionTitleRatio = overlapRatio(leftDecisionTitles, rightDecisionTitles);
  const rightChoicesByTitle = new Map(right.decisions.map((decision) => [normalize(decision.title), normalize(decision.choice)]));
  const sharedDecisionTitles = new Set(leftDecisionTitles.map(normalize).filter((title) => rightChoicesByTitle.has(title)));
  const matchedDecisionChoiceRatio = ratio(
    left.decisions.filter((decision) => rightChoicesByTitle.get(normalize(decision.title)) === normalize(decision.choice)).length,
    sharedDecisionTitles.size,
  );
  const implementationStepOverlapRatio = overlapRatio(left.implementationSteps, right.implementationSteps);
  const riskOverlapRatio = overlapRatio(left.risks, right.risks);
  const assumptionOverlapRatio = overlapRatio(left.assumptions, right.assumptions);
  const sharedEvidenceReferenceRatio = overlapRatio(
    left.decisions.flatMap((decision) => decision.evidenceRefs),
    right.decisions.flatMap((decision) => decision.evidenceRefs),
  );

  // 高重合意味着结构上更接近；分数只描述可见产物的差异，不代表质量优劣。
  const score = Number((1 - (
    matchedDecisionChoiceRatio
    + implementationStepOverlapRatio
    + riskOverlapRatio
    + assumptionOverlapRatio
    + sharedEvidenceReferenceRatio
  ) / 5).toFixed(4));
  const status = orientations.size === 2 && score >= 0.5 ? "sufficient" : "limited";
  const reasons = [
    orientations.size === 2
      ? "Both required delivery and quality orientations are present."
      : "The required delivery and quality orientations are not both present.",
    `Structural diversity score is ${score}; identical decision choices, steps, risks, assumptions, and evidence reduce this signal.`,
  ];

  return {
    kind: "structural_candidate_diversity",
    status,
    candidateIds,
    orientationCoverage: ratio(orientations.size, 2),
    sharedDecisionTitleRatio,
    matchedDecisionChoiceRatio,
    implementationStepOverlapRatio,
    riskOverlapRatio,
    assumptionOverlapRatio,
    sharedEvidenceReferenceRatio,
    score,
    reasons,
    limitations: [
      "This compares normalized structured fields only; it does not establish semantic diversity, independent model reasoning, or solution quality.",
      "A shared execution-plan source can legitimately produce overlapping decision titles and evidence references.",
    ],
  };
}
