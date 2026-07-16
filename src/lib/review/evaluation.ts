import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "./contracts";
import { runReviewWorkflow, type ReviewWorkflowResult } from "./review-service";

export type ReviewConformanceMetrics = {
  candidateOrientationCoverage: number;
  supportedFindingEvidenceRate: number;
  evaluatorCandidateCoverage: number;
  decisionTraceability: number;
  humanGateAccuracy: number;
  revisionBounded: number;
  failureDisclosure: number;
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

/** Measures contract and safety conformance; it does not claim semantic report quality. */
export function evaluateReviewConformance(result: ReviewWorkflowResult, expectedHumanGate: boolean): ReviewConformanceMetrics {
  const orientations = new Set(result.candidates.map((candidate) => candidate.orientation));
  const supported = result.review.findings.filter((finding) => result.evaluation.supportedFindingIds.includes(finding.id));
  const evaluatedIds = new Set(result.evaluation.candidateEvaluations.map((item) => item.candidateId));
  const fullyScored = result.candidates.filter((candidate) => {
    const evaluation = result.evaluation.candidateEvaluations.find((item) => item.candidateId === candidate.id);
    return evaluation && evaluation.scores.length > 0 && evaluation.scores.every((score) => score.rationale.length >= 5);
  });
  const isDegraded = result.status === "partial" || result.status === "inconclusive";
  return {
    candidateOrientationCoverage: ratio(orientations.size, 2),
    supportedFindingEvidenceRate: ratio(supported.filter((finding) => finding.evidenceRefs.length > 0).length, supported.length),
    evaluatorCandidateCoverage: ratio(fullyScored.filter((candidate) => evaluatedIds.has(candidate.id)).length, result.candidates.length),
    decisionTraceability: result.evaluation.reasons.length > 0 && result.evaluation.nextAction.length >= 5 ? 1 : 0,
    humanGateAccuracy: (result.evaluation.decision === "needs_human") === expectedHumanGate ? 1 : 0,
    revisionBounded: result.currentRound <= result.maxRounds ? 1 : 0,
    failureDisclosure: isDegraded ? (result.failures.length > 0 ? 1 : 0) : 1,
  };
}

export async function runControlledReviewConformance() {
  const requirements = [
    "Build a public company website for prospective customers with product pages, case studies, contact forms, accessibility acceptance, and staged delivery.",
    "Build an operations admin portal for support staff with role permissions, ticket workflow, audit history, search, and phased acceptance.",
    "Build a learning planner for university students with task breakdown, focus sessions, progress statistics, weekly review, and privacy requirements.",
  ];
  const budget = ReviewBudgetSchema.parse({});
  const cases: Array<{ projectType: string; metrics: ReviewConformanceMetrics }> = [];
  for (const requirement of requirements) {
    const analysis = analyzeRequirementBaseline(requirement);
    const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
    const result = await runReviewWorkflow({ analysis, plan, budget });
    cases.push({ projectType: analysis.projectType, metrics: evaluateReviewConformance(result, true) });
  }
  const metricNames: Array<keyof ReviewConformanceMetrics> = [
    "candidateOrientationCoverage", "supportedFindingEvidenceRate", "evaluatorCandidateCoverage",
    "decisionTraceability", "humanGateAccuracy", "revisionBounded", "failureDisclosure",
  ];
  const aggregate = Object.fromEntries(metricNames.map((name) => [name, Number((cases.reduce((sum, item) => sum + item.metrics[name], 0) / cases.length).toFixed(4))])) as ReviewConformanceMetrics;
  return { sampleSize: cases.length, cases, aggregate, scope: "deterministic workflow conformance; excludes blind semantic-quality comparison" as const };
}
