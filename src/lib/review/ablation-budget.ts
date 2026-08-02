import { calculateCost, LONGCAT_STANDARD_PRICING } from "@/lib/billing";
import type { AblationRunPlan } from "./ablation-protocol";

export const ABLATION_RUN_MAX_TOKENS = 12_000;
export const ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS = 16_000;

/** 价格快照和 token 限制都属于真实消融协议，变更后必须重新授权。 */
export const ABLATION_LONGCAT_PRICING_SNAPSHOT = {
  sourceUrl: LONGCAT_STANDARD_PRICING.sourceUrl,
  retrievedAt: LONGCAT_STANDARD_PRICING.retrievedAt,
  inputUsdPerMillion: LONGCAT_STANDARD_PRICING.inputUsdPerMillion,
  outputUsdPerMillion: LONGCAT_STANDARD_PRICING.outputUsdPerMillion,
  inputTreatment: "uncached" as const,
};

export const ABLATION_ARM_MAXIMUM_CALLS = {
  single_agent: 1,
  dual_candidate_no_review: 13,
  // Planner 在补充假设后会重新执行一次可重试的结构化分析；两轮都可能各用两次尝试。
  // 因此 C/D 的最坏路径要额外预留两次调用，不能只按一次分析重试计算。
  single_candidate_with_review: 21,
  full_multi_agent: 23,
} as const;

/**
 * 基于冻结调用拓扑和单次输入估算/输出协议限制计算费用储备。
 * 输出上限由请求参数约束；输入 token 只能在响应后由 Provider 计量，因此此值是授权参考而非账单硬上限。
 */
export function estimateAblationBudget(input: {
  plan: AblationRunPlan;
  maxEstimatedInputTokens?: number;
  maxOutputTokens?: number;
}) {
  const maxEstimatedInputTokens = input.maxEstimatedInputTokens ?? ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS;
  const maxOutputTokens = input.maxOutputTokens ?? ABLATION_RUN_MAX_TOKENS;
  const arms = Object.entries(ABLATION_ARM_MAXIMUM_CALLS).map(([variant, maximumCalls]) => {
    const runCount = input.plan.runs.filter((run) => run.variant === variant).length;
    const maxEstimatedInputTokensPerRun = maximumCalls * maxEstimatedInputTokens;
    const maxOutputTokensPerRun = maximumCalls * maxOutputTokens;
    const reserveUsd = calculateCost(LONGCAT_STANDARD_PRICING.model, maxEstimatedInputTokensPerRun, maxOutputTokensPerRun).costUsd;
    return { variant, maximumCalls, runCount, maxEstimatedInputTokensPerRun, maxOutputTokensPerRun, reserveUsd };
  });
  return {
    maxEstimatedInputTokens,
    maxOutputTokens,
    arms,
    minimumPerRunUsd: Math.max(...arms.map((arm) => arm.reserveUsd)),
    minimumTotalUsd: Number(arms.reduce((sum, arm) => sum + arm.runCount * arm.reserveUsd, 0).toFixed(8)),
  };
}
