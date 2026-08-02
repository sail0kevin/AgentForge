import { prisma } from "@/lib/db";
import { applyIncrementalApprovalPatch, IncrementalApprovalPatchSchema, type IncrementalApprovalPatch } from "@/lib/planner/incremental-approval";
import { CandidateSolutionSchema, EvaluationResultSchema, type ApprovalDecision, type ReviewBudget } from "./contracts";
import type { ReviewWorkflowResult } from "./review-service";

type ReviewIdentity = {
  runId: string;
  planningArtifactId: string;
  userId: string;
  budget: ReviewBudget;
  workflowNodeKey?: string;
};

function parseJson(value: string | null) {
  return value ? JSON.parse(value) as unknown : null;
}

/**
 * Persist one complete review snapshot. The ownership assertion binds the review
 * run and its source plan to the same authenticated user before any JSON is saved.
 */
export async function saveReviewWorkflow(input: ReviewIdentity & { result: ReviewWorkflowResult }) {
  const source = await prisma.planningArtifact.findFirst({
    where: { id: input.planningArtifactId, userId: input.userId, status: "ready", run: { userId: input.userId } },
    select: { id: true },
  });
  const run = await prisma.run.findFirst({ where: { id: input.runId, userId: input.userId }, select: { id: true } });
  if (!source) throw new Error("PLANNING_ARTIFACT_NOT_READY");
  if (!run) throw new Error("RUN_NOT_FOUND");

  const approvalStatus = input.result.evaluation.decision === "needs_human" ? "pending" : "not_required";
  return prisma.reviewWorkflow.create({
    data: {
      runId: input.runId,
      planningArtifactId: input.planningArtifactId,
      userId: input.userId,
      status: input.result.status,
      candidatesJson: JSON.stringify(input.result.candidates),
      reviewJson: JSON.stringify(input.result.review),
      evaluationJson: JSON.stringify(input.result.evaluation),
      failuresJson: JSON.stringify(input.result.failures),
      budgetState: JSON.stringify(input.budget),
      currentRound: input.result.currentRound,
      maxRounds: input.result.maxRounds,
      approvalStatus,
      schemaVersion: 1,
      workflowNodeKey: input.workflowNodeKey,
    },
  });
}

export function mapReviewWorkflow(record: {
  id: string; runId: string; planningArtifactId: string; status: string; candidatesJson: string;
  reviewJson: string | null; evaluationJson: string | null; failuresJson: string; budgetState: string;
  currentRound: number; maxRounds: number; approvalStatus: string; approvalDecision: string | null;
  approvalNote: string | null; decidedAt: Date | null; schemaVersion: number; createdAt: Date; updatedAt: Date;
  approvalTaskPatchJson: string | null; approvalOriginalPlanSha256: string | null; approvalAmendedPlanSha256: string | null;
}) {
  return {
    id: record.id,
    runId: record.runId,
    planningArtifactId: record.planningArtifactId,
    status: record.status,
    candidates: parseJson(record.candidatesJson),
    review: parseJson(record.reviewJson),
    evaluation: parseJson(record.evaluationJson),
    failures: parseJson(record.failuresJson),
    budget: parseJson(record.budgetState),
    currentRound: record.currentRound,
    maxRounds: record.maxRounds,
    approval: {
      status: record.approvalStatus,
      decision: record.approvalDecision,
      note: record.approvalNote,
      decidedAt: record.decidedAt?.toISOString() ?? null,
      taskPatch: parseJson(record.approvalTaskPatchJson),
      originalPlanSha256: record.approvalOriginalPlanSha256,
      amendedPlanSha256: record.approvalAmendedPlanSha256,
    },
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function applyHumanDecision(evaluationJson: string | null, candidatesJson: string, decision: ApprovalDecision, note: string | null) {
  if (!evaluationJson) throw new Error("EVALUATION_NOT_FOUND");
  const evaluation = EvaluationResultSchema.parse(JSON.parse(evaluationJson));
  const candidates = CandidateSolutionSchema.array().parse(JSON.parse(candidatesJson));
  const orientation = decision === "approve_delivery" ? "delivery" : decision === "approve_quality" ? "quality" : null;
  const candidateId = orientation
    ? candidates.find((candidate) => candidate.orientation === orientation)?.id ?? null
    : null;
  if (orientation && !candidateId) throw new Error("APPROVAL_CANDIDATE_NOT_FOUND");

  return EvaluationResultSchema.parse({
    ...evaluation,
    decision: decision === "reject" ? "blocked" : "approved",
    selectedCandidateId: candidateId,
    reasons: [
      ...evaluation.reasons,
      decision === "hybrid"
        ? "Human selected a hybrid approach; the Reporter must merge the hard quality gates with staged delivery."
        : decision === "reject"
          ? "Human rejected all current candidates and requested a new planning cycle."
          : `Human approved the ${orientation} candidate.`,
      ...(note ? [`Human note: ${note.slice(0, 450)}`] : []),
    ].slice(-20),
    unresolvedConflicts: [],
    nextAction: decision === "reject" ? "Return to planning and create new candidates." : "Generate the report using the recorded human decision.",
  });
}

/** Records a high-impact human decision exactly once; identical retries are idempotent. */
export async function decideReviewWorkflow(input: { id: string; userId: string; decision: ApprovalDecision; note?: string; taskPatch?: IncrementalApprovalPatch }) {
  if (input.decision === "reject" && input.taskPatch) throw new Error("APPROVAL_PATCH_REJECT_CONFLICT");
  const record = await prisma.reviewWorkflow.findFirst({ where: { id: input.id, userId: input.userId }, include: { planningArtifact: { select: { executionPlan: true } } } });
  if (!record) throw new Error("REVIEW_NOT_FOUND");
  const note = input.note?.trim() || null;
  const taskPatch = input.taskPatch ? IncrementalApprovalPatchSchema.parse(input.taskPatch) : null;
  const normalizedPatch = taskPatch ? JSON.stringify(taskPatch) : null;
  if (record.approvalStatus !== "pending") {
    if (record.approvalDecision === input.decision && record.approvalNote === note && record.approvalTaskPatchJson === normalizedPatch) return record;
    throw new Error("REVIEW_ALREADY_DECIDED");
  }
  const storedEvaluation = record.evaluationJson ? EvaluationResultSchema.parse(JSON.parse(record.evaluationJson)) : null;
  if ((record.status !== "needs_human" && record.status !== "partial") || storedEvaluation?.decision !== "needs_human") {
    throw new Error("REVIEW_NOT_AWAITING_HUMAN");
  }

  const amended = taskPatch
    ? (() => {
        if (!record.planningArtifact.executionPlan) throw new Error("PLANNING_ARTIFACT_NOT_READY");
        return applyIncrementalApprovalPatch(JSON.parse(record.planningArtifact.executionPlan), taskPatch);
      })()
    : null;

  const evaluation = applyHumanDecision(record.evaluationJson, record.candidatesJson, input.decision, note);
  const decidedAt = new Date();
  const updated = await prisma.reviewWorkflow.updateMany({
    where: { id: record.id, userId: input.userId, approvalStatus: "pending" },
    data: {
      status: input.decision === "reject" ? "blocked" : record.status === "partial" ? "partial" : "approved",
      evaluationJson: JSON.stringify(evaluation),
      approvalStatus: input.decision === "reject" ? "rejected" : "approved",
      approvalDecision: input.decision,
      approvalNote: note,
      approvalTaskPatchJson: normalizedPatch,
      approvalOriginalPlanSha256: amended?.originalPlanSha256 ?? null,
      approvalAmendedPlanSha256: amended?.amendedPlanSha256 ?? null,
      decidedAt,
    },
  });
  if (updated.count !== 1) throw new Error("REVIEW_DECISION_CONFLICT");
  return prisma.reviewWorkflow.findUniqueOrThrow({ where: { id: record.id } });
}
