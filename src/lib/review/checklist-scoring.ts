import type { LightweightCase } from "./lightweight-case-manifest";

export type ChecklistHit = {
  id: string;
  description: string;
  isConstraint: boolean;
  matched: boolean;
  matchedKeyword: string | null;
};

export type ChecklistScoreResult = {
  caseId: string;
  hits: ChecklistHit[];
  totalPoints: number;
  matchedPoints: number;
  coverageRate: number;
  constraintPoints: number;
  matchedConstraintPoints: number;
  constraintSatisfactionRate: number | null;
};

export type ChecklistAggregate = {
  sampleSize: number;
  averageCoverageRate: number;
  averageConstraintSatisfactionRate: number | null;
  totalConstraintPoints: number;
};

/** Keyword presence only proves "mentioned", not "verified feasible" — see roadmap 5.3 caveat. */
export function scoreChecklistAgainstText(testCase: LightweightCase, generatedText: string): ChecklistScoreResult {
  const normalizedText = generatedText.toLowerCase();
  const hits: ChecklistHit[] = testCase.checklist.map((item) => {
    const matchedKeyword = item.keywords.find((keyword) => normalizedText.includes(keyword.toLowerCase())) ?? null;
    return {
      id: item.id,
      description: item.description,
      isConstraint: item.isConstraint,
      matched: matchedKeyword !== null,
      matchedKeyword,
    };
  });

  const totalPoints = hits.length;
  const matchedPoints = hits.filter((hit) => hit.matched).length;
  const constraintHits = hits.filter((hit) => hit.isConstraint);
  const matchedConstraintPoints = constraintHits.filter((hit) => hit.matched).length;

  return {
    caseId: testCase.caseId,
    hits,
    totalPoints,
    matchedPoints,
    coverageRate: totalPoints === 0 ? 0 : matchedPoints / totalPoints,
    constraintPoints: constraintHits.length,
    matchedConstraintPoints,
    constraintSatisfactionRate: constraintHits.length === 0 ? null : matchedConstraintPoints / constraintHits.length,
  };
}

export function aggregateChecklistScores(results: ChecklistScoreResult[]): ChecklistAggregate {
  const sampleSize = results.length;
  const withConstraints = results.filter((result) => result.constraintSatisfactionRate !== null);
  return {
    sampleSize,
    averageCoverageRate: sampleSize === 0 ? 0 : results.reduce((sum, result) => sum + result.coverageRate, 0) / sampleSize,
    averageConstraintSatisfactionRate: withConstraints.length === 0
      ? null
      : withConstraints.reduce((sum, result) => sum + (result.constraintSatisfactionRate ?? 0), 0) / withConstraints.length,
    totalConstraintPoints: results.reduce((sum, result) => sum + result.constraintPoints, 0),
  };
}
