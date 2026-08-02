import type { AblationRunPlan } from "./ablation-protocol";
import { hashAblationJson } from "./ablation-results";
import { ABLATION_LONGCAT_PRICING_SNAPSHOT, ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS, ABLATION_RUN_MAX_TOKENS, estimateAblationBudget } from "./ablation-budget";

export type AblationExecutionAuthorizationTemplate = {
  schemaVersion: 2;
  status: "pending";
  approvedBy: "<待负责人填写>";
  approvedAt: "<待负责人填写>";
  provider: "longcat-openai-compatible";
  model: string;
  temperature: number | "<待负责人填写>";
  plannerPromptVersion: string;
  reviewPromptVersion: string;
  ragSnapshot: string;
  caseManifestSha256: string;
  runPlanSha256: string;
  maxEstimatedInputTokensPerCall: number;
  maxOutputTokensPerCall: number;
  pricingSnapshot: typeof ABLATION_LONGCAT_PRICING_SNAPSHOT;
  maxCostUsdPerRun: number;
  maxTotalCostUsd: number;
  rawOutputRoot: "local-only/ablation/raw";
  ledgerPath: "local-only/ablation/result-ledger.json";
};

export function createAblationExecutionAuthorizationTemplate(input: {
  plan: AblationRunPlan;
  model?: string;
  temperature?: number;
  plannerPromptVersion?: string;
  reviewPromptVersion?: string;
  ragSnapshot?: string;
  maxEstimatedInputTokensPerCall?: number;
  maxOutputTokensPerCall?: number;
}) {
  const maxEstimatedInputTokensPerCall = input.maxEstimatedInputTokensPerCall ?? ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS;
  const maxOutputTokensPerCall = input.maxOutputTokensPerCall ?? ABLATION_RUN_MAX_TOKENS;
  if (!Number.isInteger(maxEstimatedInputTokensPerCall) || maxEstimatedInputTokensPerCall < 1) {
    throw new Error("ABLATION_AUTHORIZATION_TEMPLATE_INPUT_TOKEN_LIMIT_INVALID");
  }
  if (!Number.isInteger(maxOutputTokensPerCall) || maxOutputTokensPerCall < 1) {
    throw new Error("ABLATION_AUTHORIZATION_TEMPLATE_OUTPUT_TOKEN_LIMIT_INVALID");
  }
  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) {
    throw new Error("ABLATION_AUTHORIZATION_TEMPLATE_TEMPERATURE_INVALID");
  }

  const budget = estimateAblationBudget({ plan: input.plan, maxEstimatedInputTokens: maxEstimatedInputTokensPerCall, maxOutputTokens: maxOutputTokensPerCall });
  return {
    schemaVersion: 2 as const,
    status: "pending" as const,
    approvedBy: "<待负责人填写>" as const,
    approvedAt: "<待负责人填写>" as const,
    provider: "longcat-openai-compatible" as const,
    model: input.model ?? "<待负责人填写；当前计费快照仅支持 LongCat-2.0>",
    temperature: input.temperature ?? "<待负责人填写>",
    plannerPromptVersion: input.plannerPromptVersion ?? "<待负责人填写>",
    reviewPromptVersion: input.reviewPromptVersion ?? "<待负责人填写>",
    ragSnapshot: input.ragSnapshot ?? "<待负责人填写>",
    caseManifestSha256: input.plan.caseManifestSha256,
    runPlanSha256: hashAblationJson(input.plan),
    maxEstimatedInputTokensPerCall,
    maxOutputTokensPerCall,
    pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
    // 这是按冻结协议计算的建议最低储备，不是负责人批准的预算或 Provider 账单上限。
    maxCostUsdPerRun: budget.minimumPerRunUsd,
    maxTotalCostUsd: budget.minimumTotalUsd,
    rawOutputRoot: "local-only/ablation/raw" as const,
    ledgerPath: "local-only/ablation/result-ledger.json" as const,
  } satisfies AblationExecutionAuthorizationTemplate;
}
