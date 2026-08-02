import { createHash } from "node:crypto";
import { z } from "zod";
import { ABLATION_VARIANTS } from "./agent-comparison";
import { AblationRunPlanSchema, type AblationRunPlan } from "./ablation-protocol";

const AblationVariantSchema = z.enum(ABLATION_VARIANTS);

/** 单次实验运行的不可变环境描述；真实实验不得在同一 ledger 中混用模型或参数。 */
export const AblationStudyMetadataSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  plannerPromptVersion: z.string().min(1),
  reviewPromptVersion: z.string().min(1),
  ragSnapshot: z.string().min(1),
  caseManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  runPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  maxEstimatedInputTokensPerCall: z.number().int().positive(),
  maxOutputTokensPerCall: z.number().int().positive(),
  pricingSnapshot: z.object({
    sourceUrl: z.url(),
    retrievedAt: z.string().datetime({ offset: true }),
    inputUsdPerMillion: z.number().positive(),
    outputUsdPerMillion: z.number().positive(),
    inputTreatment: z.literal("uncached"),
  }),
  maxCostUsdPerRun: z.number().positive(),
  maxTotalCostUsd: z.number().positive(),
  rawOutputRoot: z.string().min(1),
  ledgerPath: z.string().min(1),
  // 授权文件本身是外部成本同意记录；结果台账只引用 Git 忽略目录中的私有副本和内容哈希。
  authorizationPath: z.string().min(1),
  authorizationSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * 每个 run 都保留成功、失败和空输出三种事实状态。
 * `excluded` 不是质量分数为零，而是无法构成配对比较的明确记录。
 */
export const AblationRunResultSchema = z.object({
  runId: z.string().min(1),
  caseId: z.string().min(1),
  trial: z.number().int().positive(),
  variant: AblationVariantSchema,
  status: z.enum(["completed", "excluded"]),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  coverageRate: z.number().min(0).max(1).nullable(),
  constraintSatisfactionRate: z.number().min(0).max(1).nullable(),
  outputSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  rawOutputPath: z.string().min(1).nullable(),
  errorCode: z.string().min(1).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  callCount: z.number().int().nonnegative(),
}).superRefine((result, context) => {
  const completed = result.status === "completed";
  if (completed && (result.coverageRate === null || result.outputSha256 === null || result.rawOutputPath === null)) {
    context.addIssue({ code: "custom", message: "ABLATION_COMPLETED_RESULT_INCOMPLETE" });
  }
  if (!completed && (
    result.coverageRate !== null
    || result.constraintSatisfactionRate !== null
    || result.outputSha256 !== null
    || result.rawOutputPath !== null
    || result.errorCode === null
  )) {
    context.addIssue({ code: "custom", message: "ABLATION_EXCLUDED_RESULT_INVALID" });
  }
  const startedAt = Date.parse(result.startedAt);
  const finishedAt = Date.parse(result.finishedAt);
  if (finishedAt < startedAt) {
    context.addIssue({ code: "custom", message: "ABLATION_RESULT_TIME_ORDER_INVALID" });
  } else if (finishedAt - startedAt !== result.durationMs) {
    // CLI 将同一对 Date 的差值直接写入台账，保持精确一致才能发现被改写的耗时字段。
    context.addIssue({ code: "custom", message: "ABLATION_RESULT_DURATION_MISMATCH" });
  }
});

export const AblationResultLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  protocolVersion: z.literal("ablation-v2"),
  createdAt: z.string().datetime({ offset: true }),
  metadata: AblationStudyMetadataSchema,
  results: z.array(AblationRunResultSchema),
  // 在发起外部调用前先持久化该标记。进程异常中断时，不能擅自重试一个可能已经计费的请求。
  inFlightRunId: z.string().min(1).nullable(),
});

export type AblationStudyMetadata = z.infer<typeof AblationStudyMetadataSchema>;
export type AblationRunResult = z.infer<typeof AblationRunResultSchema>;
export type AblationResultLedger = z.infer<typeof AblationResultLedgerSchema>;

/** 对 JSON 的确定性序列化做 SHA-256，用于防止运行计划和结果台账被静默替换。 */
export function hashAblationJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * 验证台账严格覆盖冻结矩阵一次且仅一次。
 * 不允许用少跑的臂、未知 runId 或不同案例清单的结果生成质量结论。
 */
export function validateAblationResultLedgerDraft(raw: unknown, plan: AblationRunPlan): AblationResultLedger {
  const ledger = AblationResultLedgerSchema.parse(raw);
  const validatedPlan = AblationRunPlanSchema.parse(plan);
  if (ledger.metadata.caseManifestSha256 !== validatedPlan.caseManifestSha256) throw new Error("ABLATION_RESULT_MANIFEST_MISMATCH");
  if (ledger.metadata.runPlanSha256 !== hashAblationJson(validatedPlan)) throw new Error("ABLATION_RESULT_PLAN_HASH_MISMATCH");

  const expected = new Map(validatedPlan.runs.map((run) => [run.runId, run]));
  const seen = new Set<string>();
  for (const result of ledger.results) {
    const run = expected.get(result.runId);
    if (!run) throw new Error("ABLATION_RESULT_RUN_UNKNOWN");
    if (seen.has(result.runId)) throw new Error("ABLATION_RESULT_RUN_DUPLICATE");
    seen.add(result.runId);
    if (result.caseId !== run.caseId || result.trial !== run.trial || result.variant !== run.variant) {
      throw new Error("ABLATION_RESULT_RUN_IDENTITY_MISMATCH");
    }
    if (result.costUsd > ledger.metadata.maxCostUsdPerRun) {
      throw new Error("ABLATION_RESULT_PER_RUN_COST_EXCEEDED");
    }
  }
  const totalCostUsd = ledger.results.reduce((total, result) => total + result.costUsd, 0);
  // 成本由十进制金额转换为 JavaScript number，保留极小浮点容差以避免无意义的二进制舍入误报。
  if (totalCostUsd > ledger.metadata.maxTotalCostUsd + 1e-9) {
    throw new Error("ABLATION_RESULT_TOTAL_COST_EXCEEDED");
  }
  if (ledger.inFlightRunId && !expected.has(ledger.inFlightRunId)) throw new Error("ABLATION_RESULT_IN_FLIGHT_RUN_UNKNOWN");
  if (ledger.inFlightRunId && seen.has(ledger.inFlightRunId)) throw new Error("ABLATION_RESULT_IN_FLIGHT_RUN_SETTLED");
  return ledger;
}

/**
 * 正式统计只接受完整、无未结算调用的账本。草稿账本只能用于断点恢复，绝不能用于生成质量结论。
 */
export function validateAblationResultLedger(raw: unknown, plan: AblationRunPlan): AblationResultLedger {
  const ledger = validateAblationResultLedgerDraft(raw, plan);
  if (ledger.results.length !== plan.runs.length) throw new Error("ABLATION_RESULT_COUNT_MISMATCH");
  if (ledger.inFlightRunId !== null) throw new Error("ABLATION_RESULT_IN_FLIGHT_UNRESOLVED");
  return ledger;
}

/** 恢复既有实验时，所有冻结参数必须逐项一致，防止把不同实验混入同一个 ledger。 */
export function assertAblationStudyMetadataMatches(actual: AblationStudyMetadata, expected: AblationStudyMetadata) {
  if (
    actual.provider !== expected.provider
    || actual.model !== expected.model
    || actual.temperature !== expected.temperature
    || actual.plannerPromptVersion !== expected.plannerPromptVersion
    || actual.reviewPromptVersion !== expected.reviewPromptVersion
    || actual.ragSnapshot !== expected.ragSnapshot
    || actual.caseManifestSha256 !== expected.caseManifestSha256
    || actual.runPlanSha256 !== expected.runPlanSha256
    || actual.maxEstimatedInputTokensPerCall !== expected.maxEstimatedInputTokensPerCall
    || actual.maxOutputTokensPerCall !== expected.maxOutputTokensPerCall
    || actual.pricingSnapshot.sourceUrl !== expected.pricingSnapshot.sourceUrl
    || actual.pricingSnapshot.retrievedAt !== expected.pricingSnapshot.retrievedAt
    || actual.pricingSnapshot.inputUsdPerMillion !== expected.pricingSnapshot.inputUsdPerMillion
    || actual.pricingSnapshot.outputUsdPerMillion !== expected.pricingSnapshot.outputUsdPerMillion
    || actual.pricingSnapshot.inputTreatment !== expected.pricingSnapshot.inputTreatment
    || actual.maxCostUsdPerRun !== expected.maxCostUsdPerRun
    || actual.maxTotalCostUsd !== expected.maxTotalCostUsd
    || actual.rawOutputRoot !== expected.rawOutputRoot
    || actual.ledgerPath !== expected.ledgerPath
    || actual.authorizationPath !== expected.authorizationPath
    || actual.authorizationSha256 !== expected.authorizationSha256
  ) {
    throw new Error("ABLATION_RESUME_METADATA_MISMATCH");
  }
}

/** 只把成功且有评分的记录转换为统计观测；排除项仍由 ledger 计数，不补零。 */
export function toPairedMetricObservations(ledger: AblationResultLedger, metric: "coverageRate" | "constraintSatisfactionRate") {
  return ledger.results.map((result) => ({
    caseId: result.caseId,
    trial: result.trial,
    variant: result.variant,
    value: result.status === "completed" ? result[metric] : null,
  }));
}

export function summarizeAblationAvailability(ledger: AblationResultLedger) {
  const byVariant = Object.fromEntries(ABLATION_VARIANTS.map((variant) => [variant, { completed: 0, excluded: 0 }])) as Record<(typeof ABLATION_VARIANTS)[number], { completed: number; excluded: number }>;
  for (const result of ledger.results) byVariant[result.variant][result.status] += 1;
  return byVariant;
}
