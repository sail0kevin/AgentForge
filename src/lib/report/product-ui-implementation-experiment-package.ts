import { z } from "zod";
import type { DevelopmentReport, ProductUIReportGroup } from "./contracts";
import {
  ProductUIAcceptanceProbeSchema,
  ProductUIBlindReviewAssignmentSchema,
  ProductUIHumanReviewDimensionSchema,
  ProductUIImplementationEvaluationModelSchema,
  createProductUIImplementationEvaluationCase,
  stableJsonSha256,
  type ProductUIAcceptanceProbe,
  type ProductUIBlindReviewAssignment,
  type ProductUIImplementationEvaluationCase,
} from "./product-ui-implementation-evaluation";
import {
  buildProductUIImplementationManifest,
  type ProductUIImplementationManifest,
} from "./product-ui-implementation-manifest";

export const PRODUCT_UI_IMPLEMENTATION_EXPERIMENT_PACKAGE_VERSION = 1 as const;

const VariantArtifactPathsSchema = z.object({
  baseline_direct_prompt: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
  agentforge_manifest: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
});

export const ProductUIBlindReviewSubmissionDraftSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1).max(160),
  caseId: z.string().min(1).max(160),
  candidateId: z.string().regex(/^blind-[a-z0-9-]{3,120}$/),
  raterId: z.string().regex(/^rater-[a-z0-9-]{3,120}$/),
  rubricVersion: z.string().min(1).max(160),
  submittedAt: z.string().datetime().nullable(),
  scores: z.array(z.object({
    dimension: ProductUIHumanReviewDimensionSchema,
    score: z.number().int().min(1).max(5).nullable(),
    reason: z.string().max(2_000),
  })).length(ProductUIHumanReviewDimensionSchema.options.length),
}).strict();

export type ProductUIBlindReviewSubmissionDraft = z.infer<typeof ProductUIBlindReviewSubmissionDraftSchema>;

export type ProductUIImplementationExperimentPackage = {
  schemaVersion: typeof PRODUCT_UI_IMPLEMENTATION_EXPERIMENT_PACKAGE_VERSION;
  packageType: "agentforge_product_ui_implementation_experiment";
  generatedAt: string;
  evaluationCase: ProductUIImplementationEvaluationCase;
  operatorHandoff: {
    baseline: {
      variant: "baseline_direct_prompt";
      prompt: string;
      promptSha256: string;
    };
    agentforge: {
      variant: "agentforge_manifest";
      prompt: string;
      promptSha256: string;
      report: DevelopmentReport;
      reportSha256: string;
      manifest: ProductUIImplementationManifest;
      manifestSha256: string;
    };
  };
  admin: {
    blindReviewAssignments: ProductUIBlindReviewAssignment[];
  };
  reviewer: {
    instructions: string[];
    candidates: Array<{
      candidateId: string;
      reviewArtifactPaths: string[];
    }>;
    submissionTemplates: ProductUIBlindReviewSubmissionDraft[];
  };
  outputLayout: {
    evaluationCase: "case.json";
    baselinePrompt: "operator/baseline-direct-prompt.md";
    agentforgePrompt: "operator/agentforge-manifest-prompt.md";
    agentforgeReport: "operator/agentforge-report.json";
    agentforgeManifest: "operator/agentforge-manifest.json";
    blindReviewAssignments: "admin/blind-review-assignments.json";
    reviewerPackage: "reviewer/review-package.json";
  };
};

export type ProductUIImplementationExperimentPackageInput = {
  studyId: string;
  caseId: string;
  group: ProductUIReportGroup;
  report: DevelopmentReport;
  downstreamModel: z.infer<typeof ProductUIImplementationEvaluationModelSchema>;
  acceptanceProbes?: ProductUIAcceptanceProbe[];
  minimumCaseCount?: number;
  minimumRaterCount?: number;
  humanReviewRubricVersion: string;
  reviewArtifactPaths?: z.infer<typeof VariantArtifactPathsSchema>;
  generatedAt?: string;
};

function buildBaselinePrompt(requirement: string) {
  return [
    "You are an AI coding agent. Implement a complete, responsive website from the following user requirement.",
    "Use your normal engineering judgment. Do not assume access to an AgentForge report, manifest, design evidence, or evaluation results.",
    "Deliver working source code and record only actual runtime evidence after running the website.",
    "",
    "User requirement:",
    requirement,
  ].join("\n");
}

function buildAgentforgePrompt(manifest: ProductUIImplementationManifest) {
  return [
    "You are an AI coding agent. Implement the website using the frozen AgentForge implementation manifest below.",
    "Treat every route, required state, constraint, design decision, and acceptance item as binding implementation input.",
    "Do not claim a website was validated until you have run it and produced actual runtime evidence for the registered acceptance items.",
    "",
    "Frozen AgentForge implementation manifest:",
    "```json",
    JSON.stringify(manifest, null, 2),
    "```",
  ].join("\n");
}

function anonymousCandidateId(studyId: string, caseId: string, position: "a" | "b") {
  // ID 只由研究和 Case 标识派生，避免在评审材料里暴露具体分支名称。
  return `blind-${stableJsonSha256({ studyId, caseId, position }).slice(0, 16)}-${position}`;
}

function defaultReviewArtifactPaths(caseId: string) {
  const segment = stableJsonSha256(caseId).slice(0, 16);
  return {
    baseline_direct_prompt: [`artifacts/blind/${segment}-a.png`],
    agentforge_manifest: [`artifacts/blind/${segment}-b.png`],
  };
}

function createSubmissionTemplate(input: {
  studyId: string;
  caseId: string;
  candidateId: string;
  rubricVersion: string;
}) {
  return ProductUIBlindReviewSubmissionDraftSchema.parse({
    schemaVersion: 1,
    studyId: input.studyId,
    caseId: input.caseId,
    candidateId: input.candidateId,
    raterId: "rater-replace-before-submission",
    rubricVersion: input.rubricVersion,
    submittedAt: null,
    scores: ProductUIHumanReviewDimensionSchema.options.map((dimension) => ({
      dimension,
      score: null,
      reason: "",
    })),
  });
}

/**
 * 从真实 Product/UI 报告导出双分支实验包。
 * 管理员、下游实现者和盲评者各自只收到完成其职责所需的最小信息集。
 */
export function buildProductUIImplementationExperimentPackage(
  input: ProductUIImplementationExperimentPackageInput,
): ProductUIImplementationExperimentPackage {
  const spec = input.report.productUISpec;
  if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");
  if (!input.group.reports.some((report) => report.productUISpec?.solutionId === spec.solutionId)) {
    throw new Error("PRODUCT_UI_REPORT_NOT_IN_GROUP");
  }

  const manifest = buildProductUIImplementationManifest(input.group, input.report, { generatedAt: input.generatedAt });
  const baselinePrompt = buildBaselinePrompt(input.group.requirement);
  const agentforgePrompt = buildAgentforgePrompt(manifest);
  const acceptanceIds = manifest.acceptance.matrix.map((item) => item.id);
  const artifactPaths = VariantArtifactPathsSchema.parse(input.reviewArtifactPaths ?? defaultReviewArtifactPaths(input.caseId));
  const evaluationCase = createProductUIImplementationEvaluationCase({
    studyId: input.studyId,
    caseId: input.caseId,
    requirement: input.group.requirement,
    reportGroupId: input.group.groupId,
    solutionId: spec.solutionId,
    routes: manifest.routes.map((route) => route.route),
    expectedAcceptanceIds: acceptanceIds,
    acceptanceProbes: input.acceptanceProbes?.map((probe) => ProductUIAcceptanceProbeSchema.parse(probe)) ?? [],
    downstreamModel: ProductUIImplementationEvaluationModelSchema.parse(input.downstreamModel),
    minimumCaseCount: input.minimumCaseCount,
    minimumRaterCount: input.minimumRaterCount,
    humanReviewRubricVersion: input.humanReviewRubricVersion,
    baselinePrompt,
    agentforgePrompt,
    report: input.report,
    manifest,
  });

  const baselineCandidateId = anonymousCandidateId(input.studyId, input.caseId, "a");
  const agentforgeCandidateId = anonymousCandidateId(input.studyId, input.caseId, "b");
  const assignments = [
    ProductUIBlindReviewAssignmentSchema.parse({
      schemaVersion: 1,
      studyId: input.studyId,
      caseId: input.caseId,
      candidateId: baselineCandidateId,
      variant: "baseline_direct_prompt",
      reviewArtifactPaths: artifactPaths.baseline_direct_prompt,
    }),
    ProductUIBlindReviewAssignmentSchema.parse({
      schemaVersion: 1,
      studyId: input.studyId,
      caseId: input.caseId,
      candidateId: agentforgeCandidateId,
      variant: "agentforge_manifest",
      reviewArtifactPaths: artifactPaths.agentforge_manifest,
    }),
  ];

  return {
    schemaVersion: PRODUCT_UI_IMPLEMENTATION_EXPERIMENT_PACKAGE_VERSION,
    packageType: "agentforge_product_ui_implementation_experiment",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evaluationCase,
    operatorHandoff: {
      baseline: {
        variant: "baseline_direct_prompt",
        prompt: baselinePrompt,
        promptSha256: evaluationCase.variants.find((item) => item.variant === "baseline_direct_prompt")!.promptSha256,
      },
      agentforge: {
        variant: "agentforge_manifest",
        prompt: agentforgePrompt,
        promptSha256: evaluationCase.variants.find((item) => item.variant === "agentforge_manifest")!.promptSha256,
        report: input.report,
        reportSha256: stableJsonSha256(input.report),
        manifest,
        manifestSha256: stableJsonSha256(manifest),
      },
    },
    admin: {
      blindReviewAssignments: assignments,
    },
    reviewer: {
      instructions: [
        "Review each anonymous candidate independently using the required six dimensions.",
        "Do not infer or record the implementation origin of either candidate.",
        "Replace the rater ID, submitted time, every score, and every reason with actual review data before submission.",
        "A draft template is not a completed review and cannot be used as quality evidence.",
      ],
      candidates: assignments.map((assignment) => ({
        candidateId: assignment.candidateId,
        reviewArtifactPaths: assignment.reviewArtifactPaths,
      })),
      submissionTemplates: assignments.map((assignment) => createSubmissionTemplate({
        studyId: input.studyId,
        caseId: input.caseId,
        candidateId: assignment.candidateId,
        rubricVersion: input.humanReviewRubricVersion,
      })),
    },
    outputLayout: {
      evaluationCase: "case.json",
      baselinePrompt: "operator/baseline-direct-prompt.md",
      agentforgePrompt: "operator/agentforge-manifest-prompt.md",
      agentforgeReport: "operator/agentforge-report.json",
      agentforgeManifest: "operator/agentforge-manifest.json",
      blindReviewAssignments: "admin/blind-review-assignments.json",
      reviewerPackage: "reviewer/review-package.json",
    },
  };
}