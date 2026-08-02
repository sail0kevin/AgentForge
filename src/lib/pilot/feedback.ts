import { z } from "zod";
import { prisma } from "@/lib/db";

export const PilotReportUsabilitySchema = z.enum([
  "usable_without_edits",
  "usable_with_edits",
  "not_usable",
]);

export const PilotInterventionReasonSchema = z.enum([
  "not_needed",
  "missing_context",
  "tradeoff_confirmation",
  "risk_confirmation",
  "other",
]);

export const PilotEvidenceIssueTypeSchema = z.enum([
  "none",
  "missing_evidence",
  "irrelevant_evidence",
  "incorrect_evidence",
  "outdated_evidence",
  "other",
]);

export const PilotFailureCategorySchema = z.enum([
  "none",
  "requirement_understanding",
  "plan_quality",
  "review_quality",
  "report_quality",
  "workflow_reliability",
  "provider_failure",
  "other",
]);

export const PilotFeedbackInputSchema = z.object({
  reportUsability: PilotReportUsabilitySchema,
  humanEdited: z.boolean(),
  interventionReason: PilotInterventionReasonSchema.optional(),
  evidenceIssueType: PilotEvidenceIssueTypeSchema.optional(),
  failureCategory: PilotFailureCategorySchema.optional(),
  note: z.string().trim().max(2_000).optional(),
}).superRefine((value, context) => {
  if (value.humanEdited && !value.interventionReason) {
    context.addIssue({
      code: "custom",
      path: ["interventionReason"],
      message: "标记人工修改时必须说明干预原因。",
    });
  }
});

export type PilotFeedbackInput = z.infer<typeof PilotFeedbackInputSchema>;

const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "partial", "blocked", "inconclusive", "failed"]);

type PilotFeedbackRecord = {
  id: string;
  workflowId: string;
  reportUsability: string;
  humanEdited: boolean;
  interventionReason: string | null;
  evidenceIssueType: string | null;
  failureCategory: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapPilotFeedback(record: PilotFeedbackRecord) {
  return {
    id: record.id,
    workflowId: record.workflowId,
    reportUsability: PilotReportUsabilitySchema.parse(record.reportUsability),
    humanEdited: record.humanEdited,
    interventionReason: record.interventionReason ? PilotInterventionReasonSchema.parse(record.interventionReason) : null,
    evidenceIssueType: record.evidenceIssueType ? PilotEvidenceIssueTypeSchema.parse(record.evidenceIssueType) : null,
    failureCategory: record.failureCategory ? PilotFailureCategorySchema.parse(record.failureCategory) : null,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function getOwnedTerminalWorkflow(workflowId: string, userId: string) {
  const workflow = await prisma.developmentWorkflow.findFirst({
    where: { id: workflowId, userId },
    select: { id: true, status: true },
  });
  if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
  if (!TERMINAL_WORKFLOW_STATUSES.has(workflow.status)) throw new Error("WORKFLOW_NOT_TERMINAL");
  return workflow;
}

/**
 * 试点反馈只关联当前用户自己的已终态工作流；不持久化 Prompt、原始输出或 Provider 凭证。
 */
export async function getPilotFeedback(workflowId: string, userId: string) {
  await getOwnedTerminalWorkflow(workflowId, userId);
  const feedback = await prisma.pilotFeedback.findFirst({ where: { workflowId, userId } });
  return feedback ? mapPilotFeedback(feedback) : null;
}

/**
 * 同一工作流只有一份可修订反馈，upsert 让试点参与者能够在复盘后校正记录。
 */
export async function savePilotFeedback(input: { workflowId: string; userId: string; feedback: PilotFeedbackInput }) {
  await getOwnedTerminalWorkflow(input.workflowId, input.userId);
  const feedback = PilotFeedbackInputSchema.parse(input.feedback);
  const record = await prisma.pilotFeedback.upsert({
    where: { workflowId: input.workflowId },
    create: {
      workflowId: input.workflowId,
      userId: input.userId,
      reportUsability: feedback.reportUsability,
      humanEdited: feedback.humanEdited,
      interventionReason: feedback.interventionReason ?? null,
      evidenceIssueType: feedback.evidenceIssueType ?? null,
      failureCategory: feedback.failureCategory ?? null,
      note: feedback.note || null,
    },
    update: {
      reportUsability: feedback.reportUsability,
      humanEdited: feedback.humanEdited,
      interventionReason: feedback.interventionReason ?? null,
      evidenceIssueType: feedback.evidenceIssueType ?? null,
      failureCategory: feedback.failureCategory ?? null,
      note: feedback.note || null,
    },
  });
  return mapPilotFeedback(record);
}
