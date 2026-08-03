import { z } from "zod";

export const ReportStatusSchema = z.enum(["completed", "partial", "blocked", "inconclusive"]);
export const ReportSourceTypeSchema = z.enum([
  "requirement", "plan_task", "report_section", "candidate", "finding", "evaluation", "human_decision", "human_task_edit", "knowledge", "github_evidence",
]);

// GitHub 仓库中的 UI 参考证据，必须记录版本、路径、核验状态和复用限制。
export const GitHubEvidenceVerificationStatusSchema = z.enum(["not_checked", "verified"]);
export const GitHubEvidenceSchema = z.object({
  id: z.string().min(1).max(120),
  repositoryUrl: z.string().url().max(500),
  repositoryName: z.string().min(2).max(160),
  commitOrTag: z.string().min(1).max(120),
  path: z.string().min(1).max(500),
  locator: z.string().max(500).nullable().default(null),
  license: z.string().min(1).max(160),
  evidenceType: z.enum(["design_system", "component_library", "accessibility_primitive", "application_architecture", "example_implementation"]),
  insight: z.string().min(10).max(1_000),
  applicableWhen: z.array(z.string().min(3).max(300)).min(1).max(12),
  reusePolicy: z.enum(["reference_only", "adapt_with_license_review", "approved_reuse"]),
  repositoryVerification: GitHubEvidenceVerificationStatusSchema.default("not_checked"),
  pathVerification: GitHubEvidenceVerificationStatusSchema.default("not_checked"),
  licenseVerification: GitHubEvidenceVerificationStatusSchema.default("not_checked"),
});

export const ProductUISolutionTypeSchema = z.enum(["experience_first", "visual_first", "engineering_first"]);
export const ProductUIEvidenceAuditStatusSchema = z.enum(["not_checked", "partially_verified", "fully_verified"]);

export const ProductUIPageBlueprintSchema = z.object({
  layout: z.string().min(10).max(500),
  aboveFold: z.array(z.string().min(5).max(300)).min(1).max(12),
  contentRules: z.array(z.string().min(5).max(500)).min(1).max(12),
  interactionRules: z.array(z.string().min(5).max(500)).min(1).max(12),
});

export const ProductUIPageSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(2).max(160),
  route: z.string().min(1).max(200),
  purpose: z.string().min(10).max(500),
  primaryAction: z.string().min(3).max(300),
  sections: z.array(z.string().min(2).max(200)).min(1).max(20),
  requiredStates: z.array(z.enum(["loading", "empty", "error", "success", "permission_denied", "mobile"])).min(1).max(10),
  components: z.array(z.string().min(2).max(160)).min(1).max(30),
  // 页面蓝图把首屏层级、内容槽位和交互关系交给下游 AI，避免仅凭页面名称猜测布局。
  blueprint: ProductUIPageBlueprintSchema.optional(),
  // 页面级实施要求让下游 AI 不必猜测内容、布局和交互细节。
  implementationInstructions: z.array(z.string().min(5).max(500)).min(1).max(12).optional(),
  acceptanceCriteria: z.array(z.string().min(5).max(500)).min(1).max(15),
});

export const ProductUIFlowSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(2).max(160),
  goal: z.string().min(10).max(500),
  steps: z.array(z.string().min(3).max(500)).min(2).max(20),
  failureRecovery: z.string().min(10).max(500),
});

export const ProductUIDesignTokensSchema = z.object({
  colorStrategy: z.string().min(10).max(500),
  typography: z.string().min(10).max(500),
  spacing: z.string().min(5).max(300),
  radius: z.string().min(5).max(200),
  elevation: z.string().min(5).max(300),
  motion: z.string().min(5).max(300),
});

export const ProductUIDesignDirectionSchema = z.object({
  name: z.string().min(2).max(160),
  positioning: z.string().min(10).max(500),
  visualPrinciples: z.array(z.string().min(5).max(300)).min(3).max(10),
  layoutStrategy: z.string().min(10).max(500),
  componentStrategy: z.string().min(10).max(500),
  avoid: z.array(z.string().min(5).max(300)).min(1).max(10),
  tokens: ProductUIDesignTokensSchema,
});

export const ProductUIComponentSchema = z.object({
  name: z.string().min(2).max(160),
  responsibility: z.string().min(10).max(500),
  variants: z.array(z.string().min(2).max(160)).min(1).max(12),
  states: z.array(z.string().min(2).max(160)).min(1).max(12),
  accessibility: z.array(z.string().min(5).max(300)).min(1).max(10),
});

export const ProductUIAcceptanceMatrixItemSchema = z.object({
  id: z.string().min(1).max(120),
  targetType: z.enum(["page", "flow", "component", "responsive", "accessibility", "evidence", "export", "runtime"]),
  targetId: z.string().min(1).max(160),
  criterion: z.string().min(10).max(500),
  verificationMethod: z.string().min(10).max(500),
  expectedEvidence: z.string().min(10).max(500),
});

export const ProductUITraceabilityStatusSchema = z.enum(["implemented", "target_design", "verified", "unverified"]);

// 让下游 Agent 能知道每条 UI 结论来自哪里，以及它目前处于什么可信状态。
export const ProductUITraceabilitySchema = z.object({
  id: z.string().min(1).max(120),
  area: z.enum(["requirement", "scope", "plan", "review", "knowledge", "github", "handoff"]),
  statement: z.string().min(10).max(1_000),
  status: ProductUITraceabilityStatusSchema,
  sourceRefs: z.array(z.lazy(() => ReportSourceReferenceSchema)).min(1).max(12),
});

export const ProductUIDeliveryBoundarySchema = z.object({
  included: z.array(z.string().min(5).max(500)).min(1).max(20),
  excluded: z.array(z.string().min(5).max(500)).min(1).max(20),
  handoff: z.string().min(20).max(1_000),
});

export const ProductUIAIExecutionContractSchema = z.object({
  objective: z.string().min(20).max(1_000),
  outputRequirements: z.array(z.string().min(10).max(500)).min(3).max(20),
  implementationOrder: z.array(z.string().min(5).max(500)).min(3).max(20),
  contentRequirements: z.array(z.string().min(5).max(500)).min(2).max(20),
  forbiddenClaims: z.array(z.string().min(5).max(500)).min(2).max(20),
  verificationChecklist: z.array(z.string().min(5).max(500)).min(3).max(20),
});

export const ProductUISpecSchema = z.object({
  schemaVersion: z.literal(1),
  solutionId: z.string().min(1).max(120),
  solutionType: ProductUISolutionTypeSchema,
  productName: z.string().min(2).max(200),
  productPositioning: z.string().min(20).max(1_000),
  targetUsers: z.array(z.string().min(2).max(200)).min(1).max(12),
  primaryScenarios: z.array(z.string().min(5).max(500)).min(1).max(12),
  pages: z.array(ProductUIPageSchema).min(3).max(30),
  userFlows: z.array(ProductUIFlowSchema).min(1).max(12),
  designDirection: ProductUIDesignDirectionSchema,
  components: z.array(ProductUIComponentSchema).min(3).max(40),
  responsiveRules: z.array(z.string().min(10).max(500)).min(3).max(20),
  interactionStates: z.array(z.string().min(5).max(500)).min(4).max(20),
  implementationConstraints: z.array(z.string().min(5).max(500)).min(3).max(20),
  visualAcceptanceCriteria: z.array(z.string().min(5).max(500)).min(5).max(30),
  // 每条验收要求都绑定稳定 ID、对象和证据形式，支持下游逐项回传真实结果。
  acceptanceMatrix: z.array(ProductUIAcceptanceMatrixItemSchema).min(6).max(100).optional(),
  deliveryBoundary: ProductUIDeliveryBoundarySchema,
  // 新报告会填写该契约；optional 保证历史报告仍可读取。
  aiExecutionContract: ProductUIAIExecutionContractSchema.optional(),
  traceability: z.array(ProductUITraceabilitySchema).min(4).max(40),
  evidence: z.array(GitHubEvidenceSchema).min(1).max(30),
  evidenceStatus: z.enum(["curated_reference", "sha_pinned", "not_yet_verified"]),
  evidenceAuditStatus: ProductUIEvidenceAuditStatusSchema,
});

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
  // 可选的产品/UI 实施规格，供下游 AI 编程 Agent 消费。
  productUISpec: ProductUISpecSchema.optional(),
});

// 下游网站必须回传可复核的运行证据，避免只凭文字备注标记为已验收。
export const ProductUIRuntimeEvidenceSchema = z.object({
  launchCommand: z.string().trim().min(3).max(1_000),
  previewUrl: z.string().url().max(1_000),
  screenshotPaths: z.array(z.string().trim().min(1).max(1_000)).min(1).max(20),
  verificationNotes: z.array(z.string().trim().min(3).max(1_000)).min(1).max(30),
  // 新报告按验收矩阵的稳定 ID 回传结果；默认值保证历史反馈 JSON 仍可读取。
  acceptanceResults: z.array(z.object({
    acceptanceId: z.string().trim().min(1).max(120),
    status: z.enum(["passed", "failed", "not_verified"]),
    note: z.string().trim().min(3).max(1_000),
    evidencePaths: z.array(z.string().trim().min(1).max(1_000)).max(20),
  })).max(100).default([]).superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.acceptanceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "acceptanceId"],
          message: "每个验收矩阵 ID 只能回传一次结果。",
        });
      }
      seen.add(item.acceptanceId);
    }
  }),
});

export const ProductUIReportFeedbackSchema = z.object({
  solutionId: z.string().min(1).max(120),
  outcome: z.enum(["pass", "needs_revision"]),
  note: z.string().min(1).max(2_000),
  // 保持旧数据可读取；旧的自由文本反馈不能将报告组推进到 accepted。
  runtimeEvidence: ProductUIRuntimeEvidenceSchema.nullable().default(null),
  checkedAt: z.string().datetime(),
});

export const ProductUIReportGroupSchema = z.object({
  schemaVersion: z.literal(1),
  groupId: z.string().min(1).max(120),
  requirement: z.string().min(10).max(8_000),
  reports: z.array(z.lazy(() => DevelopmentReportSchema)).min(2).max(6),
  comparison: z.array(z.object({
    solutionId: z.string().min(1).max(120),
    strengths: z.array(z.string().min(5).max(500)).min(1).max(10),
    tradeoffs: z.array(z.string().min(5).max(500)).min(1).max(10),
  })).min(2).max(6),
  status: z.enum(["generated", "in_review", "accepted", "needs_revision"]).default("generated"),
  feedback: z.array(ProductUIReportFeedbackSchema).default([]),
});

export const ReportBudgetSchema = z.object({
  maxTokens: z.number().int().min(1_000).max(500_000).default(60_000),
  maxCostUsd: z.number().positive().max(1_000).default(5),
});

export type ReportSourceReference = z.infer<typeof ReportSourceReferenceSchema>;
export type ReportClaim = z.infer<typeof ReportClaimSchema>;
export type DevelopmentReport = z.infer<typeof DevelopmentReportSchema>;
export type ReportBudget = z.infer<typeof ReportBudgetSchema>;
export type GitHubEvidence = z.infer<typeof GitHubEvidenceSchema>;
export type ProductUIEvidenceAuditStatus = z.infer<typeof ProductUIEvidenceAuditStatusSchema>;
export type ProductUISolutionType = z.infer<typeof ProductUISolutionTypeSchema>;
export type ProductUIPage = z.infer<typeof ProductUIPageSchema>;
export type ProductUIPageBlueprint = z.infer<typeof ProductUIPageBlueprintSchema>;
export type ProductUIFlow = z.infer<typeof ProductUIFlowSchema>;
export type ProductUIComponent = z.infer<typeof ProductUIComponentSchema>;
export type ProductUIAcceptanceMatrixItem = z.infer<typeof ProductUIAcceptanceMatrixItemSchema>;
export type ProductUITraceability = z.infer<typeof ProductUITraceabilitySchema>;
export type ProductUIAIExecutionContract = z.infer<typeof ProductUIAIExecutionContractSchema>;
export type ProductUISpec = z.infer<typeof ProductUISpecSchema>;
export type ProductUIReportGroup = z.infer<typeof ProductUIReportGroupSchema>;
export type ProductUIRuntimeEvidence = z.infer<typeof ProductUIRuntimeEvidenceSchema>;
export type ProductUIAcceptanceResult = ProductUIRuntimeEvidence["acceptanceResults"][number];
export type ProductUIReportFeedback = z.infer<typeof ProductUIReportFeedbackSchema>;
