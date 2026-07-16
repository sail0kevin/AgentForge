import { z } from "zod";

export const ReportStatusSchema = z.enum(["completed", "partial", "blocked", "inconclusive"]);
export const ReportSourceTypeSchema = z.enum([
  "requirement", "plan_task", "report_section", "candidate", "finding", "evaluation", "human_decision", "knowledge",
]);

export const ReportSourceReferenceSchema = z.object({
  sourceType: ReportSourceTypeSchema,
  refId: z.string().min(1).max(300),
  label: z.string().min(2).max(300),
  locator: z.string().max(500).nullable().default(null),
});

export const ReportClaimSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["fact", "assumption", "recommendation", "risk", "tradeoff", "open_question"]),
  statement: z.string().min(5).max(2_000),
  confidence: z.enum(["high", "medium", "low"]),
  sourceRefs: z.array(ReportSourceReferenceSchema).min(1).max(12),
});

export const ReportChapterSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(2).max(160),
  order: z.number().int().positive(),
  purpose: z.string().min(5).max(500),
  summary: z.string().min(10).max(1_000),
  bodyMarkdown: z.string().min(10).max(30_000),
  claims: z.array(ReportClaimSchema).min(1).max(60),
});

export const SourceManifestEntrySchema = ReportSourceReferenceSchema.extend({
  usedByClaimIds: z.array(z.string().min(1)).min(1).max(200),
});

export const DevelopmentReportSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(5).max(300),
  status: ReportStatusSchema,
  executiveSummary: z.string().min(20).max(4_000),
  decisionSummary: z.string().min(10).max(2_000),
  sections: z.array(ReportChapterSchema).min(3).max(20),
  assumptions: z.array(ReportClaimSchema).max(30),
  risks: z.array(ReportClaimSchema).max(40),
  unresolvedItems: z.array(ReportClaimSchema).max(30),
  sourceManifest: z.array(SourceManifestEntrySchema).min(1).max(500),
});

export const ReportBudgetSchema = z.object({
  maxTokens: z.number().int().min(1_000).max(500_000).default(60_000),
  maxCostUsd: z.number().positive().max(1_000).default(5),
});

export type ReportSourceReference = z.infer<typeof ReportSourceReferenceSchema>;
export type ReportClaim = z.infer<typeof ReportClaimSchema>;
export type DevelopmentReport = z.infer<typeof DevelopmentReportSchema>;
export type ReportBudget = z.infer<typeof ReportBudgetSchema>;
