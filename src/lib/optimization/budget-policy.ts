import type { BudgetState } from '@/lib/planner/contracts';

/**
 * 预算等级
 *
 * - minimal: 最低成本，适合快速验证和原型阶段
 * - standard: 标准质量，适合大多数生产场景
 * - thorough: 最高质量，适合关键项目和复杂需求
 */
export type BudgetTier = 'minimal' | 'standard' | 'thorough';

/**
 * 优化策略配置
 *
 * 控制各项成本优化开关，平衡质量和成本
 */
export interface OptimizationPolicy {
  /** 最大Token限制 */
  maxTokens: number;
  /** 是否启用Planner缓存 */
  useCache: boolean;
  /** 是否启用动态候选数量 */
  dynamicCandidates: boolean;
  /** 是否启用快速通道（跳过Revise） */
  enableFastPath: boolean;
  /** 最大Review轮次 */
  maxReviewRounds: number;
}

/**
 * 预算策略配置表
 *
 * 三档预算策略的具体参数配置
 */
export const BUDGET_POLICIES: Record<BudgetTier, OptimizationPolicy> = {
  /**
   * 最低成本策略
   *
   * - Token限制: 30k
   * - 启用所有优化: 缓存、动态候选、快速通道
   * - 单轮Review
   * - 预期成本: ~$0.18/case
   * - 适用场景: 快速验证、原型开发、低预算项目
   */
  minimal: {
    maxTokens: 30_000,
    useCache: true,
    dynamicCandidates: true,
    enableFastPath: true,
    maxReviewRounds: 1,
  },

  /**
   * 标准质量策略（默认）
   *
   * - Token限制: 60k
   * - 启用部分优化: 缓存、动态候选
   * - 双轮Review
   * - 预期成本: ~$0.40/case
   * - 适用场景: 大多数生产项目
   */
  standard: {
    maxTokens: 60_000,
    useCache: true,
    dynamicCandidates: true,
    enableFastPath: false,
    maxReviewRounds: 2,
  },

  /**
   * 最高质量策略
   *
   * - Token限制: 120k
   * - 关闭优化，确保完整流程
   * - 三轮Review
   * - 预期成本: ~$0.73/case
   * - 适用场景: 关键项目、高复杂度需求
   */
  thorough: {
    maxTokens: 120_000,
    useCache: false,
    dynamicCandidates: false,
    enableFastPath: false,
    maxReviewRounds: 3,
  },
};

/**
 * 根据用户预算自动选择预算等级
 *
 * 判定规则：
 * - maxTokens <= 40k: minimal
 * - maxTokens <= 80k: standard
 * - maxTokens > 80k: thorough
 *
 * @param budget - 用户预算配置
 * @returns 推荐的预算等级
 */
export function selectBudgetTier(budget?: BudgetState): BudgetTier {
  if (!budget) return 'standard';

  const maxTokens = budget.maxTokens ?? 60_000;

  if (maxTokens <= 40_000) return 'minimal';
  if (maxTokens <= 80_000) return 'standard';
  return 'thorough';
}

/**
 * 应用优化策略
 *
 * 根据预算等级返回对应的优化策略配置
 *
 * @param tier - 预算等级
 * @returns 优化策略配置
 */
export function applyOptimizationPolicy(tier: BudgetTier): OptimizationPolicy {
  return BUDGET_POLICIES[tier];
}

/**
 * 估算Token消耗（基于历史数据）
 *
 * @param tier - 预算等级
 * @param complexity - 需求复杂度等级
 * @returns 预估Token范围
 */
export function estimateTokenUsage(
  tier: BudgetTier,
  complexity: 'low' | 'medium' | 'high'
): { min: number; max: number; avg: number } {
  // 基于24场景消融实验的历史数据
  const baselineTokens = {
    low: { min: 30_000, max: 50_000, avg: 40_000 },
    medium: { min: 60_000, max: 90_000, avg: 75_000 },
    high: { min: 100_000, max: 150_000, avg: 125_000 },
  };

  const baseline = baselineTokens[complexity];

  // 应用优化系数
  const optimizationFactor = {
    minimal: 0.35, // 65%节省
    standard: 0.55, // 45%节省
    thorough: 1.0,  // 无优化
  }[tier];

  return {
    min: Math.round(baseline.min * optimizationFactor),
    max: Math.round(baseline.max * optimizationFactor),
    avg: Math.round(baseline.avg * optimizationFactor),
  };
}

/**
 * 估算成本（USD）
 *
 * 假设使用GPT-4o定价：$2.50 per 1M input tokens
 *
 * @param tokens - Token数量
 * @returns 预估成本（美元）
 */
export function estimateCost(tokens: number): number {
  const pricePerMillion = 2.5;
  return Number(((tokens / 1_000_000) * pricePerMillion).toFixed(4));
}

/**
 * 生成预算建议报告
 *
 * @param budget - 用户预算
 * @param complexity - 需求复杂度
 * @returns 预算建议报告
 */
export function generateBudgetRecommendation(
  budget: BudgetState | undefined,
  complexity: 'low' | 'medium' | 'high'
) {
  const tier = selectBudgetTier(budget);
  const policy = applyOptimizationPolicy(tier);
  const tokenEstimate = estimateTokenUsage(tier, complexity);
  const costEstimate = estimateCost(tokenEstimate.avg);

  return {
    tier,
    policy,
    complexity,
    tokenEstimate,
    costEstimate,
    summary: `${tier}策略 | 复杂度${complexity} | 预计${tokenEstimate.avg}tokens | 约$${costEstimate}`,
  };
}
