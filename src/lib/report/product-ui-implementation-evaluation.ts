import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ProductUIImplementationRunSchema,
  ProductUIImplementationVariantSchema,
  ProductUIRuntimeEvidenceSchema,
  type ProductUIImplementationRun,
  type ProductUIImplementationVariant,
  type ProductUIRuntimeEvidence,
} from "./contracts";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ProductUIAcceptanceProbeSchema = z.object({
  acceptanceId: z.string().min(1).max(120),
  kind: z.enum([
    "route",
    "selector_visible",
    "selector_count",
    "click_then_visible",
    "responsive_no_horizontal_overflow",
    "document_language",
  ]),
  route: z.string().min(1).max(200),
  selector: z.string().min(1).max(1_000).optional(),
  targetSelector: z.string().min(1).max(1_000).optional(),
  expectedCount: z.number().int().min(0).max(1_000).optional(),
  expectedLanguage: z.string().min(2).max(32).optional(),
  viewport: z.object({
    width: z.number().int().min(320).max(4_000),
    height: z.number().int().min(320).max(4_000),
  }).optional(),
}).superRefine((probe, context) => {
  if (["selector_visible", "selector_count", "click_then_visible"].includes(probe.kind) && !probe.selector) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selector"], message: "PROBE_SELECTOR_REQUIRED" });
  }
  if (probe.kind === "selector_count" && probe.expectedCount === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedCount"], message: "PROBE_EXPECTED_COUNT_REQUIRED" });
  }
  if (probe.kind === "click_then_visible" && !probe.targetSelector) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetSelector"], message: "PROBE_TARGET_SELECTOR_REQUIRED" });
  }
  if (probe.kind === "document_language" && !probe.expectedLanguage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedLanguage"], message: "PROBE_EXPECTED_LANGUAGE_REQUIRED" });
  }
});

export const ProductUIImplementationEvaluationModelSchema = z.object({
  provider: z.string().min(1).max(100),
  adapterVersion: z.string().min(1).max(160),
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(160),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const ProductUIImplementationEvaluationVariantSchema = z.object({
  variant: ProductUIImplementationVariantSchema,
  promptSha256: Sha256Schema,
  reportSha256: Sha256Schema.nullable(),
  manifestSha256: Sha256Schema.nullable(),
});

// 每个 Case 固定需求、模型、输入快照和验收探针，保证两条分支能在同一条件下比较。
export const ProductUIImplementationEvaluationCaseSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1).max(160),
  caseId: z.string().min(1).max(160),
  requirement: z.string().min(20).max(12_000),
  reportGroupId: z.string().min(1).max(160),
  solutionId: z.string().min(1).max(160),
  routes: z.array(z.string().min(1).max(200)).min(1).max(50),
  expectedAcceptanceIds: z.array(z.string().min(1).max(120)).min(1).max(100),
  acceptanceProbes: z.array(ProductUIAcceptanceProbeSchema).max(100).default([]),
  downstreamModel: ProductUIImplementationEvaluationModelSchema,
  minimumCaseCount: z.number().int().min(1).max(500).default(6),
  minimumRaterCount: z.number().int().min(1).max(50).default(2),
  humanReviewRubricVersion: z.string().min(1).max(160),
  claimBoundary: z.string().min(20).max(2_000),
  variants: z.array(ProductUIImplementationEvaluationVariantSchema).length(2),
}).superRefine((evaluationCase, context) => {
  const acceptanceIds = new Set(evaluationCase.expectedAcceptanceIds);
  if (acceptanceIds.size !== evaluationCase.expectedAcceptanceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedAcceptanceIds"], message: "EVALUATION_ACCEPTANCE_ID_DUPLICATE" });
  }

  const variants = new Set(evaluationCase.variants.map((item) => item.variant));
  if (variants.size !== 2 || !variants.has("baseline_direct_prompt") || !variants.has("agentforge_manifest")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "EVALUATION_VARIANTS_REQUIRED" });
  }

  const baseline = evaluationCase.variants.find((item) => item.variant === "baseline_direct_prompt");
  const manifest = evaluationCase.variants.find((item) => item.variant === "agentforge_manifest");
  if (baseline && (baseline.reportSha256 !== null || baseline.manifestSha256 !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "BASELINE_MUST_NOT_BIND_AGENTFORGE_ARTIFACTS" });
  }
  if (manifest && (!manifest.reportSha256 || !manifest.manifestSha256)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "MANIFEST_VARIANT_ARTIFACTS_REQUIRED" });
  }

  const probeIds = new Set<string>();
  const routes = new Set(evaluationCase.routes);
  for (const [index, probe] of evaluationCase.acceptanceProbes.entries()) {
    if (!acceptanceIds.has(probe.acceptanceId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptanceProbes", index, "acceptanceId"], message: "PROBE_ACCEPTANCE_ID_UNKNOWN" });
    }
    if (!routes.has(probe.route)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptanceProbes", index, "route"], message: "PROBE_ROUTE_UNKNOWN" });
    }
    if (probeIds.has(probe.acceptanceId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptanceProbes", index, "acceptanceId"], message: "PROBE_ACCEPTANCE_ID_DUPLICATE" });
    }
    probeIds.add(probe.acceptanceId);
  }
});

export type ProductUIAcceptanceProbe = z.infer<typeof ProductUIAcceptanceProbeSchema>;
export type ProductUIImplementationEvaluationCase = z.infer<typeof ProductUIImplementationEvaluationCaseSchema>;
// ???????????????????????????????????
export const ProductUIClaudeGeneratorSummarySchema = z.object({
  schemaVersion: z.literal(1), type: z.literal("agentforge_product_ui_claude_generator"), runId: z.string().min(1).max(160), caseId: z.string().min(1).max(160), variant: ProductUIImplementationVariantSchema,
  projectDir: z.string().min(1).max(1_000), frozenPromptPath: z.string().min(1).max(1_000), frozenPromptSha256: Sha256Schema, expectedPromptSha256: Sha256Schema,
  claudeCommand: z.object({ command: z.string().min(1).max(1_000), args: z.array(z.string().max(4_000)).max(120) }).strict(),
  execution: z.object({ provider: z.string().min(1).max(100), model: z.string().min(1).max(200), promptVersion: z.string().min(1).max(160), parametersSha256: Sha256Schema, adapterVersion: z.string().min(1).max(160) }).strict(),
  permissionMode: z.enum(["acceptEdits", "auto"]), allowedTools: z.array(z.string().min(1).max(240)).min(1).max(40),
  seed: z.object({ sourceDir: z.string().min(1).max(1_000), sha256: Sha256Schema, fileCount: z.number().int().positive() }).strict(),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(), exitCode: z.number().int().nullable(), signal: z.string().nullable(),
  responsePath: z.string().min(1).max(1_000), stderrPath: z.string().min(1).max(1_000), failure: z.string().nullable(),
}).strict();
export type ProductUIClaudeGeneratorSummary = z.infer<typeof ProductUIClaudeGeneratorSummarySchema>;

export const ProductUIHumanReviewDimensionSchema = z.enum([
  "requirement_coverage",
  "information_architecture",
  "visual_completion",
  "interaction_and_states",
  "responsive_quality",
  "implementation_clarity",
]);

const ProductUIHumanReviewScoreSchema = z.object({
  dimension: ProductUIHumanReviewDimensionSchema,
  score: z.number().int().min(1).max(5),
  reason: z.string().trim().min(10).max(2_000),
});

// 分配表由实验管理员保管，向评分者展示时只能提供 candidateId 和匿名化的截图/预览地址。
export const ProductUIBlindReviewAssignmentSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1).max(160),
  caseId: z.string().min(1).max(160),
  candidateId: z.string().regex(/^blind-[a-z0-9-]{3,120}$/),
  variant: ProductUIImplementationVariantSchema,
  reviewArtifactPaths: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
}).strict();

// 评分记录故意不包含 variant，避免在盲评数据中暴露 Baseline 或 AgentForge 的分支身份。
export const ProductUIBlindReviewSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1).max(160),
  caseId: z.string().min(1).max(160),
  candidateId: z.string().regex(/^blind-[a-z0-9-]{3,120}$/),
  raterId: z.string().regex(/^rater-[a-z0-9-]{3,120}$/),
  rubricVersion: z.string().min(1).max(160),
  submittedAt: z.string().datetime(),
  scores: z.array(ProductUIHumanReviewScoreSchema).length(6).superRefine((scores, context) => {
    const seen = new Set<string>();
    for (const [index, score] of scores.entries()) {
      if (seen.has(score.dimension)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "dimension"], message: "HUMAN_REVIEW_DIMENSION_DUPLICATE" });
      }
      seen.add(score.dimension);
    }
    for (const dimension of ProductUIHumanReviewDimensionSchema.options) {
      if (!seen.has(dimension)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["scores"], message: `HUMAN_REVIEW_DIMENSION_MISSING:${dimension}` });
      }
    }
  }),
}).strict();

export type ProductUIHumanReviewDimension = z.infer<typeof ProductUIHumanReviewDimensionSchema>;
export type ProductUIBlindReviewAssignment = z.infer<typeof ProductUIBlindReviewAssignmentSchema>;
export type ProductUIBlindReviewSubmission = z.infer<typeof ProductUIBlindReviewSubmissionSchema>;

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function canonicalize(value: unknown, seen = new WeakSet<object>()): CanonicalJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("STABLE_JSON_NON_FINITE_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) throw new Error("STABLE_JSON_CIRCULAR_VALUE");
    seen.add(value);
    const result: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new Error("STABLE_JSON_UNSUPPORTED_VALUE");
}

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function stableJsonSha256(value: unknown) {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

export function textSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createProductUIImplementationEvaluationCase(input: {
  studyId: string;
  caseId: string;
  requirement: string;
  reportGroupId: string;
  solutionId: string;
  routes: string[];
  expectedAcceptanceIds: string[];
  acceptanceProbes?: ProductUIAcceptanceProbe[];
  downstreamModel: z.infer<typeof ProductUIImplementationEvaluationModelSchema>;
  minimumCaseCount?: number;
  minimumRaterCount?: number;
  humanReviewRubricVersion: string;
  baselinePrompt: string;
  agentforgePrompt: string;
  report: unknown;
  manifest: unknown;
}) {
  return ProductUIImplementationEvaluationCaseSchema.parse({
    schemaVersion: 1,
    studyId: input.studyId,
    caseId: input.caseId,
    requirement: input.requirement,
    reportGroupId: input.reportGroupId,
    solutionId: input.solutionId,
    routes: input.routes,
    expectedAcceptanceIds: input.expectedAcceptanceIds,
    acceptanceProbes: input.acceptanceProbes ?? [],
    downstreamModel: input.downstreamModel,
    minimumCaseCount: input.minimumCaseCount,
    minimumRaterCount: input.minimumRaterCount,
    humanReviewRubricVersion: input.humanReviewRubricVersion,
    claimBoundary: "Browser probes verify only explicitly registered runtime behavior. They do not by themselves prove visual quality, usability, or an overall quality advantage.",
    variants: [
      {
        variant: "baseline_direct_prompt",
        promptSha256: textSha256(input.baselinePrompt),
        reportSha256: null,
        manifestSha256: null,
      },
      {
        variant: "agentforge_manifest",
        promptSha256: textSha256(input.agentforgePrompt),
        reportSha256: stableJsonSha256(input.report),
        manifestSha256: stableJsonSha256(input.manifest),
      },
    ],
  });
}

function equality(left: unknown, right: unknown) {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function problem(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

export function validateProductUIClaudeGeneratorSummary(
  rawCase: unknown,
  rawSummary: unknown,
  expected: { runId: string; variant: ProductUIImplementationVariant },
): ProductUIClaudeGeneratorSummary {
  const evaluationCase = ProductUIImplementationEvaluationCaseSchema.parse(rawCase);
  const summary = ProductUIClaudeGeneratorSummarySchema.parse(rawSummary);
  const branch = evaluationCase.variants.find((item) => item.variant === expected.variant);
  if (!branch) problem("CLAUDE_GENERATOR_SUMMARY_VARIANT_UNKNOWN", expected.variant);
  if (summary.runId !== expected.runId) problem("CLAUDE_GENERATOR_SUMMARY_RUN_MISMATCH", `${summary.runId} !== ${expected.runId}`);
  if (summary.caseId !== evaluationCase.caseId) problem("CLAUDE_GENERATOR_SUMMARY_CASE_MISMATCH", `${summary.caseId} !== ${evaluationCase.caseId}`);
  if (summary.variant !== expected.variant) problem("CLAUDE_GENERATOR_SUMMARY_VARIANT_MISMATCH", `${summary.variant} !== ${expected.variant}`);
  if (summary.failure !== null || summary.exitCode !== 0) problem("CLAUDE_GENERATOR_SUMMARY_EXECUTION_FAILED", summary.runId);
  if (summary.frozenPromptSha256 !== branch.promptSha256 || summary.expectedPromptSha256 !== branch.promptSha256) {
    problem("CLAUDE_GENERATOR_SUMMARY_PROMPT_HASH_MISMATCH", summary.runId);
  }
  const expectedParametersSha256 = stableJsonSha256(evaluationCase.downstreamModel.parameters);
  if (
    summary.execution.provider !== evaluationCase.downstreamModel.provider
    || summary.execution.model !== evaluationCase.downstreamModel.model
    || summary.execution.promptVersion !== evaluationCase.downstreamModel.promptVersion
    || summary.execution.parametersSha256 !== expectedParametersSha256
    || summary.execution.adapterVersion !== evaluationCase.downstreamModel.adapterVersion
  ) {
    problem("CLAUDE_GENERATOR_SUMMARY_EXECUTION_CONDITIONS_MISMATCH", summary.runId);
  }
  return summary;
}


export function validateProductUIImplementationRun(
  rawCase: unknown,
  rawEvidence: unknown,
): ProductUIRuntimeEvidence {
  const evaluationCase = ProductUIImplementationEvaluationCaseSchema.parse(rawCase);
  const evidence = ProductUIRuntimeEvidenceSchema.parse(rawEvidence);
  const run = evidence.implementationRun;
  if (!run) problem("IMPLEMENTATION_RUN_METADATA_MISSING", "runtime evidence must include implementationRun");

  const branch = evaluationCase.variants.find((item) => item.variant === run.variant);
  if (!branch) problem("IMPLEMENTATION_RUN_VARIANT_UNKNOWN", run.variant);
  if (run.caseId !== evaluationCase.caseId) problem("IMPLEMENTATION_RUN_CASE_MISMATCH", `${run.caseId} !== ${evaluationCase.caseId}`);
  if (run.reportGroupId !== evaluationCase.reportGroupId) problem("IMPLEMENTATION_RUN_GROUP_MISMATCH", `${run.reportGroupId} !== ${evaluationCase.reportGroupId}`);
  if (run.solutionId !== evaluationCase.solutionId) problem("IMPLEMENTATION_RUN_SOLUTION_MISMATCH", `${run.solutionId} !== ${evaluationCase.solutionId}`);
  if (run.promptSha256 !== branch.promptSha256 || run.reportSha256 !== branch.reportSha256 || run.manifestSha256 !== branch.manifestSha256) {
    problem("IMPLEMENTATION_RUN_INPUT_HASH_MISMATCH", run.runId);
  }
  if (!equality(run.downstreamModel, evaluationCase.downstreamModel)) {
    problem("IMPLEMENTATION_RUN_MODEL_MISMATCH", run.runId);
  }

  // ????????????????????????????????
  const expectedParametersSha256 = stableJsonSha256(evaluationCase.downstreamModel.parameters);
  if (
    run.executionEvidence.provider !== evaluationCase.downstreamModel.provider
    || run.executionEvidence.model !== evaluationCase.downstreamModel.model
    || run.executionEvidence.promptVersion !== evaluationCase.downstreamModel.promptVersion
    || run.executionEvidence.parametersSha256 !== expectedParametersSha256
    || run.executionEvidence.adapterVersion !== evaluationCase.downstreamModel.adapterVersion
  ) {
    problem("IMPLEMENTATION_RUN_EXECUTION_CONDITIONS_MISMATCH", run.runId);
  }

  const expected = new Set(evaluationCase.expectedAcceptanceIds);
  for (const result of evidence.acceptanceResults) {
    if (!expected.has(result.acceptanceId)) problem("IMPLEMENTATION_RUN_ACCEPTANCE_UNKNOWN", result.acceptanceId);
  }
  return evidence;
}

export function createProductUIImplementationRunMetadata(
  rawCase: unknown,
  input: Omit<ProductUIImplementationRun, "schemaVersion" | "reportGroupId" | "solutionId" | "reportSha256" | "manifestSha256" | "promptSha256" | "downstreamModel" | "generatorOutputPaths" | "previewOutputPaths" | "orchestratorOutputPaths"> & {
    generatorOutputPaths?: string[];
    previewOutputPaths?: string[];
    orchestratorOutputPaths?: string[];
  },
): ProductUIImplementationRun {
  const evaluationCase = ProductUIImplementationEvaluationCaseSchema.parse(rawCase);
  const branch = evaluationCase.variants.find((item) => item.variant === input.variant);
  if (!branch) problem("IMPLEMENTATION_RUN_VARIANT_UNKNOWN", input.variant);
  if (input.caseId !== evaluationCase.caseId) problem("IMPLEMENTATION_RUN_CASE_MISMATCH", `${input.caseId} !== ${evaluationCase.caseId}`);
  return ProductUIImplementationRunSchema.parse({
    ...input,
    schemaVersion: 1,
    reportGroupId: evaluationCase.reportGroupId,
    solutionId: evaluationCase.solutionId,
    reportSha256: branch.reportSha256,
    manifestSha256: branch.manifestSha256,
    promptSha256: branch.promptSha256,
    downstreamModel: evaluationCase.downstreamModel,
  });
}

export interface ProductUIImplementationComparisonInput {
  studyId: string;
  cases: unknown[];
  runs: unknown[];
  /** 兼容旧数据；没有逐条盲评记录时，这个数字不能作为质量证据。 */
  humanReviewCount?: number;
  blindReviewAssignments?: unknown[];
  blindReviewSubmissions?: unknown[];
}

function durationMs(run: ProductUIImplementationRun) {
  const duration = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function round(value: number | null) {
  return value === null ? null : Number(value.toFixed(4));
}

type ReviewScoreBuckets = Record<ProductUIHumanReviewDimension, { baseline: number[]; agentforge: number[] }>;

function createReviewScoreBuckets(): ReviewScoreBuckets {
  return Object.fromEntries(ProductUIHumanReviewDimensionSchema.options.map((dimension) => [dimension, { baseline: [], agentforge: [] }])) as unknown as ReviewScoreBuckets;
}

function mean(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function analyzeProductUIImplementationComparison(input: ProductUIImplementationComparisonInput) {
  const cases = input.cases.map((item) => ProductUIImplementationEvaluationCaseSchema.parse(item));
  const caseIds = new Set<string>();
  const caseDeviations: string[] = [];
  for (const evaluationCase of cases) {
    if (evaluationCase.studyId !== input.studyId) caseDeviations.push(`CASE_STUDY_MISMATCH:${evaluationCase.caseId}`);
    if (caseIds.has(evaluationCase.caseId)) caseDeviations.push(`CASE_DUPLICATE:${evaluationCase.caseId}`);
    caseIds.add(evaluationCase.caseId);
  }

  const casesById = new Map(cases.map((item) => [item.caseId, item]));
  const validRuns: ProductUIRuntimeEvidence[] = [];
  const runKeys = new Set<string>();
  const runtimeDeviations: string[] = [];
  for (const rawRun of input.runs) {
    const parsed = ProductUIRuntimeEvidenceSchema.safeParse(rawRun);
    const run = parsed.success ? parsed.data.implementationRun : undefined;
    if (!parsed.success || !run) {
      runtimeDeviations.push("RUN_METADATA_MISSING_OR_INVALID");
      continue;
    }
    const evaluationCase = casesById.get(run.caseId);
    if (!evaluationCase) {
      runtimeDeviations.push(`RUN_CASE_UNKNOWN:${run.caseId}`);
      continue;
    }
    try {
      validateProductUIImplementationRun(evaluationCase, parsed.data);
    } catch (error) {
      runtimeDeviations.push(error instanceof Error ? error.message : "RUN_VALIDATION_FAILED");
      continue;
    }
    const key = `${run.caseId}:${run.variant}`;
    if (runKeys.has(key)) runtimeDeviations.push(`RUN_DUPLICATE:${key}`);
    runKeys.add(key);
    validRuns.push(parsed.data);
  }

  const variants: ProductUIImplementationVariant[] = ["baseline_direct_prompt", "agentforge_manifest"];
  const expectedRunKeys = cases.flatMap((evaluationCase) => variants.map((variant) => `${evaluationCase.caseId}:${variant}`));
  const missingRunKeys = expectedRunKeys.filter((key) => !runKeys.has(key));
  runtimeDeviations.push(...missingRunKeys.map((key) => `RUN_MISSING:${key}`));

  // ??????????????????????????????????
  for (const evaluationCase of cases) {
    const baseline = validRuns.find((item) => item.implementationRun?.caseId === evaluationCase.caseId && item.implementationRun.variant === "baseline_direct_prompt");
    const agentforge = validRuns.find((item) => item.implementationRun?.caseId === evaluationCase.caseId && item.implementationRun.variant === "agentforge_manifest");
    if (!baseline?.implementationRun || !agentforge?.implementationRun) continue;

    const baselineExecution = baseline.implementationRun.executionEvidence;
    const agentforgeExecution = agentforge.implementationRun.executionEvidence;
    if (
      baselineExecution.provider !== agentforgeExecution.provider
      || baselineExecution.model !== agentforgeExecution.model
      || baselineExecution.promptVersion !== agentforgeExecution.promptVersion
      || baselineExecution.parametersSha256 !== agentforgeExecution.parametersSha256
      || baselineExecution.adapterVersion !== agentforgeExecution.adapterVersion
      || baselineExecution.seedSha256 !== agentforgeExecution.seedSha256
    ) {
      runtimeDeviations.push(`RUN_EXECUTION_CONDITIONS_MISMATCH:${evaluationCase.caseId}`);
    }
  }

  const summaries = variants.map((variant) => {
    const runs = validRuns.filter((item) => item.implementationRun?.variant === variant);
    let expectedAcceptanceCount = 0;
    let passedAcceptanceCount = 0;
    let failedAcceptanceCount = 0;
    let notVerifiedAcceptanceCount = 0;
    let missingAcceptanceCount = 0;
    for (const evidence of runs) {
      const evaluationCase = casesById.get(evidence.implementationRun!.caseId)!;
      const byId = new Map(evidence.acceptanceResults.map((item) => [item.acceptanceId, item]));
      for (const acceptanceId of evaluationCase.expectedAcceptanceIds) {
        expectedAcceptanceCount += 1;
        const result = byId.get(acceptanceId);
        if (!result) {
          missingAcceptanceCount += 1;
        } else if (result.status === "passed" && result.evidencePaths.length > 0) {
          passedAcceptanceCount += 1;
        } else if (result.status === "failed") {
          failedAcceptanceCount += 1;
        } else {
          notVerifiedAcceptanceCount += 1;
        }
      }
    }
    const durations = runs
      .filter((item) => item.implementationRun?.exitStatus === "completed")
      .map((item) => durationMs(item.implementationRun!))
      .filter((item): item is number => item !== null);
    return {
      variant,
      registeredCaseCount: cases.length,
      runCount: runs.length,
      completedRunCount: runs.filter((item) => item.implementationRun?.exitStatus === "completed").length,
      acceptance: {
        expected: expectedAcceptanceCount,
        passed: passedAcceptanceCount,
        failed: failedAcceptanceCount,
        notVerified: notVerifiedAcceptanceCount,
        missing: missingAcceptanceCount,
        passRate: round(expectedAcceptanceCount > 0 ? passedAcceptanceCount / expectedAcceptanceCount : null),
      },
      meanObservedRuntimeMs: round(durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null),
    };
  });

  const baseline = summaries.find((item) => item.variant === "baseline_direct_prompt")!;
  const agentforge = summaries.find((item) => item.variant === "agentforge_manifest")!;
  const minimumCaseCount = cases.length > 0 ? Math.max(...cases.map((item) => item.minimumCaseCount)) : 1;
  const minimumRaterCount = cases.length > 0 ? Math.max(...cases.map((item) => item.minimumRaterCount)) : 1;

  const reviewDeviations: string[] = [];
  const validAssignments: ProductUIBlindReviewAssignment[] = [];
  const assignmentKeys = new Set<string>();
  const assignmentByCaseCandidate = new Map<string, ProductUIBlindReviewAssignment>();
  for (const [index, rawAssignment] of (input.blindReviewAssignments ?? []).entries()) {
    const parsed = ProductUIBlindReviewAssignmentSchema.safeParse(rawAssignment);
    if (!parsed.success) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_INVALID:${index}`);
      continue;
    }
    const assignment = parsed.data;
    if (assignment.studyId !== input.studyId) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_STUDY_MISMATCH:${assignment.caseId}`);
      continue;
    }
    if (!casesById.has(assignment.caseId)) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_CASE_UNKNOWN:${assignment.caseId}`);
      continue;
    }
    const key = `${assignment.caseId}:${assignment.candidateId}`;
    if (assignmentKeys.has(key)) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_DUPLICATE:${key}`);
      continue;
    }
    assignmentKeys.add(key);
    validAssignments.push(assignment);
    assignmentByCaseCandidate.set(key, assignment);
  }

  const validSubmissions: ProductUIBlindReviewSubmission[] = [];
  const submissionKeys = new Set<string>();
  for (const [index, rawSubmission] of (input.blindReviewSubmissions ?? []).entries()) {
    const parsed = ProductUIBlindReviewSubmissionSchema.safeParse(rawSubmission);
    if (!parsed.success) {
      reviewDeviations.push(`BLIND_SUBMISSION_INVALID:${index}`);
      continue;
    }
    const submission = parsed.data;
    const evaluationCase = casesById.get(submission.caseId);
    if (submission.studyId !== input.studyId) {
      reviewDeviations.push(`BLIND_SUBMISSION_STUDY_MISMATCH:${submission.caseId}`);
      continue;
    }
    if (!evaluationCase) {
      reviewDeviations.push(`BLIND_SUBMISSION_CASE_UNKNOWN:${submission.caseId}`);
      continue;
    }
    if (!assignmentByCaseCandidate.has(`${submission.caseId}:${submission.candidateId}`)) {
      reviewDeviations.push(`BLIND_SUBMISSION_CANDIDATE_UNKNOWN:${submission.caseId}:${submission.candidateId}`);
      continue;
    }
    if (submission.rubricVersion !== evaluationCase.humanReviewRubricVersion) {
      reviewDeviations.push(`BLIND_SUBMISSION_RUBRIC_MISMATCH:${submission.caseId}:${submission.raterId}`);
      continue;
    }
    const key = `${submission.caseId}:${submission.candidateId}:${submission.raterId}`;
    if (submissionKeys.has(key)) {
      reviewDeviations.push(`BLIND_SUBMISSION_DUPLICATE:${key}`);
      continue;
    }
    submissionKeys.add(key);
    validSubmissions.push(submission);
  }

  const scoreBuckets = createReviewScoreBuckets();
  const qualifiedCaseIds = new Set<string>();
  let pairedReviewCount = 0;
  let reviewedCaseCount = 0;
  for (const evaluationCase of cases) {
    const assignments = validAssignments.filter((item) => item.caseId === evaluationCase.caseId);
    if (assignments.length !== 2) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_COUNT_INVALID:${evaluationCase.caseId}`);
      continue;
    }
    const baselineAssignment = assignments.find((item) => item.variant === "baseline_direct_prompt");
    const agentforgeAssignment = assignments.find((item) => item.variant === "agentforge_manifest");
    if (!baselineAssignment || !agentforgeAssignment || new Set(assignments.map((item) => item.variant)).size !== 2) {
      reviewDeviations.push(`BLIND_ASSIGNMENT_VARIANT_PAIR_INVALID:${evaluationCase.caseId}`);
      continue;
    }

    const caseSubmissions = validSubmissions.filter((item) => item.caseId === evaluationCase.caseId);
    const raterIds = new Set(caseSubmissions.map((item) => item.raterId));
    let pairedRaterCount = 0;
    for (const raterId of raterIds) {
      const raterSubmissions = caseSubmissions.filter((item) => item.raterId === raterId);
      const baselineSubmission = raterSubmissions.find((item) => item.candidateId === baselineAssignment.candidateId);
      const agentforgeSubmission = raterSubmissions.find((item) => item.candidateId === agentforgeAssignment.candidateId);
      if (!baselineSubmission || !agentforgeSubmission) {
        reviewDeviations.push(`BLIND_REVIEW_PAIR_MISSING:${evaluationCase.caseId}:${raterId}`);
        continue;
      }
      pairedRaterCount += 1;
      pairedReviewCount += 1;
      for (const dimension of ProductUIHumanReviewDimensionSchema.options) {
        const baselineScore = baselineSubmission.scores.find((item) => item.dimension === dimension)!.score;
        const agentforgeScore = agentforgeSubmission.scores.find((item) => item.dimension === dimension)!.score;
        scoreBuckets[dimension].baseline.push(baselineScore);
        scoreBuckets[dimension].agentforge.push(agentforgeScore);
      }
    }
    if (pairedRaterCount > 0) reviewedCaseCount += 1;
    if (pairedRaterCount < evaluationCase.minimumRaterCount) {
      reviewDeviations.push(`BLIND_REVIEW_RATER_COUNT_INSUFFICIENT:${evaluationCase.caseId}`);
    } else {
      qualifiedCaseIds.add(evaluationCase.caseId);
    }
  }

  const actualHumanReviewCount = new Set(validSubmissions.map((item) => item.raterId)).size;
  if ((input.humanReviewCount ?? 0) > 0 && validSubmissions.length === 0) {
    reviewDeviations.push("HUMAN_REVIEW_DATASET_MISSING");
  }
  const humanReviewDimensions = Object.fromEntries(ProductUIHumanReviewDimensionSchema.options.map((dimension) => {
    const baselineMean = mean(scoreBuckets[dimension].baseline);
    const agentforgeMean = mean(scoreBuckets[dimension].agentforge);
    return [dimension, {
      baselineMean: round(baselineMean),
      agentforgeMean: round(agentforgeMean),
      agentforgeMinusBaseline: round(baselineMean === null || agentforgeMean === null ? null : agentforgeMean - baselineMean),
      pairedScoreCount: Math.min(scoreBuckets[dimension].baseline.length, scoreBuckets[dimension].agentforge.length),
    }];
  }));

  const runtimeComparisonEligible = cases.length >= minimumCaseCount
    && caseDeviations.length === 0
    && runtimeDeviations.length === 0;
  const qualityComparisonEligible = runtimeComparisonEligible
    && cases.length >= minimumCaseCount
    && qualifiedCaseIds.size >= minimumCaseCount
    && qualifiedCaseIds.size === cases.length
    && reviewDeviations.length === 0;
  const protocolDeviations = [...new Set([...caseDeviations, ...runtimeDeviations, ...reviewDeviations])];

  return {
    studyId: input.studyId,
    caseCount: cases.length,
    humanReviewCount: actualHumanReviewCount,
    legacyHumanReviewCount: input.humanReviewCount ?? null,
    minimumCaseCount,
    minimumRaterCount,
    variants: summaries.map((summary) => ({
      ...summary,
      deltaVsBaseline: {
        acceptancePassRate: round(summary.acceptance.passRate === null || baseline.acceptance.passRate === null
          ? null
          : summary.acceptance.passRate - baseline.acceptance.passRate),
        observedRuntimeMs: round(summary.meanObservedRuntimeMs === null || baseline.meanObservedRuntimeMs === null
          ? null
          : summary.meanObservedRuntimeMs - baseline.meanObservedRuntimeMs),
      },
    })),
    comparison: {
      agentforgeAcceptancePassRateDelta: round(agentforge.acceptance.passRate === null || baseline.acceptance.passRate === null
        ? null
        : agentforge.acceptance.passRate - baseline.acceptance.passRate),
    },
    humanReview: {
      assignmentCount: validAssignments.length,
      submissionCount: validSubmissions.length,
      uniqueRaterCount: actualHumanReviewCount,
      pairedReviewCount,
      reviewedCaseCount,
      qualifiedCaseCount: qualifiedCaseIds.size,
      dimensions: humanReviewDimensions,
    },
    protocolDeviations,
    runtimeComparisonEligible,
    qualityComparisonEligible,
    // “质量比较数据完整”不等于“AgentForge 已被证明更好”，所以保留为 false，避免把资格状态写成结论。
    qualityClaimEligible: false,
    claimBoundary: qualityComparisonEligible
      ? "The paired browser-acceptance and blind-review dataset is complete. It supports descriptive, dimension-level comparisons only; it does not by itself prove that AgentForge consistently produces better-looking or more usable websites."
      : runtimeComparisonEligible
        ? "The registered browser-acceptance comparison is complete. It supports only a descriptive comparison of explicit runtime probes; it does not prove visual quality, usability, or an overall AgentForge advantage."
        : "Toolchain output only: do not claim a runtime or quality advantage until paired runs, registered thresholds, and independent blind-review submissions are complete.",
  };
}
export function renderProductUIImplementationComparisonMarkdown(
  analysis: ReturnType<typeof analyzeProductUIImplementationComparison>,
) {
  const rows = analysis.variants.map((item) => `| ${item.variant} | ${item.runCount}/${item.registeredCaseCount} | ${item.acceptance.passed} | ${item.acceptance.failed} | ${item.acceptance.notVerified} | ${item.acceptance.missing} | ${item.acceptance.passRate ?? "n/a"} | ${item.meanObservedRuntimeMs ?? "n/a"} |`).join("\n");
  const deviations = analysis.protocolDeviations.length > 0 ? analysis.protocolDeviations.join(", ") : "none";
  return `# ${analysis.studyId} Product/UI implementation comparison\n\n- Cases: ${analysis.caseCount}/${analysis.minimumCaseCount}\n- Human reviews: ${analysis.humanReviewCount}/${analysis.minimumRaterCount}\n- Runtime comparison: ${analysis.runtimeComparisonEligible ? "eligible" : "not eligible"}\n- Quality claim: not eligible without a dedicated scored human-review dataset\n- Protocol deviations: ${deviations}\n\n${analysis.claimBoundary}\n\n| Variant | Runs | Passed | Failed | Not verified | Missing | Pass rate | Mean observed runtime ms |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n`;
}
