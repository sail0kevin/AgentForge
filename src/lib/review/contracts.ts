import { z } from "zod";

export const CandidateOrientationSchema = z.enum(["delivery", "quality"]);
export const CandidateDecisionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(3).max(200),
  choice: z.string().min(10).max(1_000),
  rationale: z.string().min(10).max(1_000),
  tradeoffs: z.array(z.string().min(3).max(500)).min(1).max(10),
  evidenceRefs: z.array(z.string().min(1).max(300)).max(20),
});

export const CandidateSolutionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(100),
  orientation: CandidateOrientationSchema,
  title: z.string().min(5).max(200),
  summary: z.string().min(20).max(2_000),
  decisions: z.array(CandidateDecisionSchema).min(2).max(20),
  implementationSteps: z.array(z.string().min(5).max(500)).min(2).max(30),
  risks: z.array(z.string().min(5).max(500)).max(20),
  assumptions: z.array(z.string().min(3).max(500)).max(20),
  estimatedEffort: z.enum(["low", "medium", "high"]),
});

export const FindingSchema = z.object({
  id: z.string().min(1).max(100),
  candidateId: z.string().min(1).max(100),
  severity: z.enum(["blocking", "high", "medium", "low"]),
  category: z.string().min(2).max(100),
  failureScenario: z.string().min(10).max(1_000),
  evidenceRefs: z.array(z.string().min(1).max(300)).max(20),
  suggestion: z.string().min(5).max(1_000),
  relatedCandidateIds: z.array(z.string().min(1).max(100)).max(5),
});

export const ReviewResultSchema = z.object({
  schemaVersion: z.literal(1),
  findings: z.array(FindingSchema).max(40),
});

export const RubricDimensionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(2).max(160),
  weight: z.number().positive().max(10),
  minimumScore: z.number().min(0).max(5),
});

export const CandidateEvaluationSchema = z.object({
  candidateId: z.string().min(1).max(100),
  scores: z.array(z.object({ dimensionId: z.string().min(1), score: z.number().min(0).max(5), rationale: z.string().min(5).max(500), evidenceRefs: z.array(z.string()).max(20) })).min(2).max(20),
  weightedScore: z.number().min(0).max(5),
});

export const EvaluationResultSchema = z.object({
  schemaVersion: z.literal(1),
  decision: z.enum(["approved", "needs_revision", "blocked", "needs_human", "inconclusive"]),
  selectedCandidateId: z.string().nullable(),
  candidateEvaluations: z.array(CandidateEvaluationSchema).max(4),
  supportedFindingIds: z.array(z.string()).max(40),
  ignoredFindingIds: z.array(z.string()).max(40),
  reasons: z.array(z.string().min(5).max(500)).min(1).max(20),
  unresolvedConflicts: z.array(z.object({ id: z.string(), question: z.string().min(5), options: z.array(z.string().min(2)).min(2).max(4), impact: z.string().min(5), relatedFindingIds: z.array(z.string()) })).max(10),
  nextAction: z.string().min(5).max(500),
});

export const ReviewBudgetSchema = z.object({
  maxCandidates: z.number().int().min(1).max(2).default(2),
  maxReviewRounds: z.number().int().min(0).max(2).default(1),
  maxFindings: z.number().int().min(1).max(40).default(20),
  maxTokens: z.number().int().min(1_000).max(1_000_000).default(80_000),
  maxCostUsd: z.number().positive().max(1_000).default(8),
});

export const ApprovalDecisionSchema = z.enum(["approve_delivery", "approve_quality", "hybrid", "reject"]);
export const HumanApprovalSchema = z.object({
  status: z.enum(["not_required", "pending", "approved", "rejected"]),
  decision: ApprovalDecisionSchema.nullable(),
  note: z.string().max(4_000).nullable(),
  decidedAt: z.string().datetime().nullable(),
});

export type CandidateSolution = z.infer<typeof CandidateSolutionSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type RubricDimension = z.infer<typeof RubricDimensionSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type ReviewBudget = z.infer<typeof ReviewBudgetSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
