import { z } from "zod";
import { prisma } from "@/lib/db";
import { ExecutionPlanSchema, RequirementAnalysisSchema } from "@/lib/planner/contracts";
import { ApprovalDecisionSchema, CandidateSolutionSchema, EvaluationResultSchema, ReviewResultSchema } from "@/lib/review/contracts";
import { DevelopmentReportSchema, type DevelopmentReport } from "./contracts";
import type { ReportGenerationInput } from "./report-service";

const failureSchema = z.array(z.object({ stage: z.string(), code: z.string() }));
const knowledgeOutputSchema = z.object({
  results: z.array(z.object({
    content: z.string(),
    citation: z.object({
      documentId: z.string(), title: z.string(), sourceUrl: z.string().nullable(), sourceVersion: z.string(), license: z.string(),
      checksumSha256: z.string(), headingPath: z.string().nullable(), startLine: z.number().int(), endLine: z.number().int(),
    }),
  })),
});
const allowedStatuses = new Set(["approved", "partial", "blocked", "inconclusive"]);

/** Loads and validates the complete, user-owned source chain needed by Reporter. */
export async function loadReportGenerationInput(reviewWorkflowId: string, userId: string): Promise<ReportGenerationInput> {
  const record = await prisma.reviewWorkflow.findFirst({
    where: { id: reviewWorkflowId, userId },
    include: { planningArtifact: true },
  });
  if (!record) throw new Error("REVIEW_NOT_FOUND");
  if (record.approvalStatus === "pending" || record.status === "needs_human") throw new Error("REPORT_APPROVAL_REQUIRED");
  if (!allowedStatuses.has(record.status)) throw new Error("REVIEW_NOT_REPORTABLE");
  if (!record.planningArtifact.requirementAnalysis || !record.planningArtifact.executionPlan || record.planningArtifact.status !== "ready") {
    throw new Error("PLANNING_ARTIFACT_NOT_READY");
  }
  if (!record.reviewJson || !record.evaluationJson) throw new Error("REVIEW_INCOMPLETE");
  const decision = record.approvalDecision ? ApprovalDecisionSchema.parse(record.approvalDecision) : null;
  const approvalStatus = z.enum(["not_required", "approved", "rejected"]).parse(record.approvalStatus);
  const invocations = await prisma.toolInvocation.findMany({
    where: { runId: record.planningArtifact.runId, userId, toolId: "knowledge-search", status: "completed", outputJson: { not: null } },
    orderBy: { startedAt: "asc" },
    select: { outputJson: true },
  });
  const knowledgeEvidence = invocations.flatMap((invocation) => {
    try {
      const parsed = knowledgeOutputSchema.safeParse(JSON.parse(invocation.outputJson ?? "null"));
      if (!parsed.success) return [];
      return parsed.data.results.map((result) => {
        const citation = result.citation;
        const refId = `${citation.documentId}:${citation.checksumSha256}:${citation.startLine}-${citation.endLine}`;
        return {
          source: {
            sourceType: "knowledge" as const,
            refId,
            label: `${citation.title}${citation.headingPath ? ` > ${citation.headingPath}` : ""}`,
            locator: `${citation.sourceUrl ?? "local"} · v${citation.sourceVersion} · ${citation.license} · lines ${citation.startLine}-${citation.endLine}`,
          },
          content: result.content,
        };
      });
    } catch {
      return [];
    }
  });
  return {
    planningArtifactId: record.planningArtifactId,
    requirement: record.planningArtifact.requirement,
    analysis: RequirementAnalysisSchema.parse(JSON.parse(record.planningArtifact.requirementAnalysis)),
    plan: ExecutionPlanSchema.parse(JSON.parse(record.planningArtifact.executionPlan)),
    reviewWorkflow: {
      id: record.id,
      status: record.status as "approved" | "partial" | "blocked" | "inconclusive",
      candidates: CandidateSolutionSchema.array().parse(JSON.parse(record.candidatesJson)),
      review: ReviewResultSchema.parse(JSON.parse(record.reviewJson)),
      evaluation: EvaluationResultSchema.parse(JSON.parse(record.evaluationJson)),
      failures: failureSchema.parse(JSON.parse(record.failuresJson)),
      approval: { status: approvalStatus, decision, note: record.approvalNote, decidedAt: record.decidedAt?.toISOString() ?? null },
    },
    knowledgeEvidence,
  };
}

/** Creates an immutable next version and links it to the previous report for the same Review. */
export async function saveReportArtifact(input: { runId: string; userId: string; generationKey: string; source: ReportGenerationInput; report: DevelopmentReport }) {
  const report = DevelopmentReportSchema.parse(input.report);
  const run = await prisma.run.findFirst({ where: { id: input.runId, userId: input.userId }, select: { id: true } });
  if (!run) throw new Error("RUN_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const previous = await tx.reportArtifact.findFirst({
      where: { reviewWorkflowId: input.source.reviewWorkflow.id, userId: input.userId },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
    return tx.reportArtifact.create({
      data: {
        runId: input.runId,
        planningArtifactId: input.source.planningArtifactId,
        reviewWorkflowId: input.source.reviewWorkflow.id,
        userId: input.userId,
        generationKey: input.generationKey,
        parentReportId: previous?.id ?? null,
        version: (previous?.version ?? 0) + 1,
        status: report.status,
        title: report.title,
        executiveSummary: report.executiveSummary,
        contentJson: JSON.stringify(report),
        sourceManifestJson: JSON.stringify(report.sourceManifest),
        schemaVersion: 1,
      },
    });
  });
}

export function mapReportArtifact(record: {
  id: string; runId: string; planningArtifactId: string; reviewWorkflowId: string; parentReportId: string | null;
  generationKey: string | null;
  version: number; status: string; title: string; executiveSummary: string; contentJson: string; sourceManifestJson: string;
  schemaVersion: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: record.id,
    runId: record.runId,
    planningArtifactId: record.planningArtifactId,
    reviewWorkflowId: record.reviewWorkflowId,
    parentReportId: record.parentReportId,
    generationKey: record.generationKey,
    version: record.version,
    status: record.status,
    title: record.title,
    executiveSummary: record.executiveSummary,
    content: DevelopmentReportSchema.parse(JSON.parse(record.contentJson)),
    sourceManifest: JSON.parse(record.sourceManifestJson) as unknown,
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
