import path from "node:path";
import { z } from "zod";
import type { AblationRunPlan } from "./ablation-protocol";
import { hashAblationJson } from "./ablation-results";
import { estimateAblationBudget } from "./ablation-budget";

/**
 * 真实消融实验的费用授权必须以可审计文件保存，不能只依赖一次性的命令行参数。
 * 该文件不保存 API Key；凭证仍只从受控环境变量读取。
 */
export const AblationExecutionAuthorizationSchema = z.object({
  schemaVersion: z.literal(2),
  status: z.literal("approved"),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime({ offset: true }),
  provider: z.literal("longcat-openai-compatible"),
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
});

export type AblationExecutionAuthorization = z.infer<typeof AblationExecutionAuthorizationSchema>;

export type AblationExecutionConfiguration = Pick<
  AblationExecutionAuthorization,
  "provider" | "model" | "temperature" | "plannerPromptVersion" | "reviewPromptVersion" | "ragSnapshot" | "maxEstimatedInputTokensPerCall" | "maxOutputTokensPerCall" | "pricingSnapshot" | "maxCostUsdPerRun" | "maxTotalCostUsd"
> & {
  rawOutputRoot: string;
  ledgerPath: string;
};

function samePath(left: string, right: string) {
  return path.resolve(left) === path.resolve(right);
}

/** 只允许将原始输出和台账写入被 Git 忽略的 local-only 私有目录。 */
export function isWithinLocalOnly(candidatePath: string, workspaceRoot: string) {
  const root = path.resolve(workspaceRoot, "local-only");
  const target = path.resolve(candidatePath);
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * 冻结计划要求每条运行都有独立的最高费用覆盖，避免总预算不足时只完成前半段实验。
 * 该校验不读取环境变量，可供真实执行前的离线授权预检复用。
 */
export function assertAblationBudgetCoversFrozenPlan(input: {
  plan: AblationRunPlan;
  maxCostUsdPerRun: number;
  maxTotalCostUsd: number;
  maxEstimatedInputTokensPerCall: number;
  maxOutputTokensPerCall: number;
}) {
  const budget = estimateAblationBudget({
    plan: input.plan,
    maxEstimatedInputTokens: input.maxEstimatedInputTokensPerCall,
    maxOutputTokens: input.maxOutputTokensPerCall,
  });
  if (input.maxCostUsdPerRun < budget.minimumPerRunUsd) {
    throw new Error("ABLATION_RUN_PER_RUN_BUDGET_TOO_LOW: output-token ceiling cannot cover the highest-cost frozen arm");
  }
  if (input.maxTotalCostUsd < budget.minimumTotalUsd) {
    throw new Error("ABLATION_RUN_TOTAL_BUDGET_TOO_LOW: total budget cannot cover the frozen output-token ceiling");
  }
  return budget.minimumTotalUsd;
}

/**
 * 在读取 Provider 凭证前，将命令行配置、冻结运行计划和负责人授权逐项绑定。
 * 任一字段变更都必须产生新的授权文件，避免把不同实验混入同一份结果台账。
 */
export function validateAblationExecutionAuthorization(input: {
  rawAuthorization: unknown;
  configuration: AblationExecutionConfiguration;
  plan: AblationRunPlan;
  workspaceRoot: string;
}) {
  const authorization = AblationExecutionAuthorizationSchema.parse(input.rawAuthorization);
  const expectedPlanHash = hashAblationJson(input.plan);
  if (authorization.caseManifestSha256 !== input.plan.caseManifestSha256 || authorization.runPlanSha256 !== expectedPlanHash) {
    throw new Error("ABLATION_AUTHORIZATION_PLAN_MISMATCH");
  }
  if (
    authorization.provider !== input.configuration.provider
    || authorization.model !== input.configuration.model
    || authorization.temperature !== input.configuration.temperature
    || authorization.plannerPromptVersion !== input.configuration.plannerPromptVersion
    || authorization.reviewPromptVersion !== input.configuration.reviewPromptVersion
    || authorization.ragSnapshot !== input.configuration.ragSnapshot
    || authorization.maxEstimatedInputTokensPerCall !== input.configuration.maxEstimatedInputTokensPerCall
    || authorization.maxOutputTokensPerCall !== input.configuration.maxOutputTokensPerCall
    || authorization.pricingSnapshot.sourceUrl !== input.configuration.pricingSnapshot.sourceUrl
    || authorization.pricingSnapshot.retrievedAt !== input.configuration.pricingSnapshot.retrievedAt
    || authorization.pricingSnapshot.inputUsdPerMillion !== input.configuration.pricingSnapshot.inputUsdPerMillion
    || authorization.pricingSnapshot.outputUsdPerMillion !== input.configuration.pricingSnapshot.outputUsdPerMillion
    || authorization.pricingSnapshot.inputTreatment !== input.configuration.pricingSnapshot.inputTreatment
    || authorization.maxCostUsdPerRun !== input.configuration.maxCostUsdPerRun
    || authorization.maxTotalCostUsd !== input.configuration.maxTotalCostUsd
    || !samePath(authorization.rawOutputRoot, input.configuration.rawOutputRoot)
    || !samePath(authorization.ledgerPath, input.configuration.ledgerPath)
  ) {
    throw new Error("ABLATION_AUTHORIZATION_CONFIGURATION_MISMATCH");
  }
  if (!isWithinLocalOnly(authorization.rawOutputRoot, input.workspaceRoot) || !isWithinLocalOnly(authorization.ledgerPath, input.workspaceRoot)) {
    throw new Error("ABLATION_AUTHORIZATION_PRIVATE_PATH_REQUIRED");
  }
  return authorization;
}
