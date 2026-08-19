import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectBudgetTier,
  applyOptimizationPolicy,
  estimateTokenUsage,
  estimateCost,
  generateBudgetRecommendation,
  BUDGET_POLICIES,
  type BudgetTier,
} from './budget-policy';

describe('BudgetPolicy', () => {
  describe('selectBudgetTier', () => {
    it('应根据maxTokens选择正确的tier', () => {
      assert.equal(selectBudgetTier({ maxTokens: 30_000, maxCostUsd: 1, maxRounds: 1, maxTasks: 10 }), 'minimal');
      assert.equal(selectBudgetTier({ maxTokens: 40_000, maxCostUsd: 2, maxRounds: 2, maxTasks: 10 }), 'minimal');
      assert.equal(selectBudgetTier({ maxTokens: 60_000, maxCostUsd: 3, maxRounds: 2, maxTasks: 10 }), 'standard');
      assert.equal(selectBudgetTier({ maxTokens: 80_000, maxCostUsd: 4, maxRounds: 2, maxTasks: 10 }), 'standard');
      assert.equal(selectBudgetTier({ maxTokens: 120_000, maxCostUsd: 5, maxRounds: 3, maxTasks: 12 }), 'thorough');
    });

    it('未提供budget应返回standard', () => {
      assert.equal(selectBudgetTier(undefined), 'standard');
    });
  });

  describe('applyOptimizationPolicy', () => {
    it('minimal策略应启用所有优化', () => {
      const policy = applyOptimizationPolicy('minimal');

      assert.equal(policy.maxTokens, 30_000);
      assert.equal(policy.useCache, true);
      assert.equal(policy.dynamicCandidates, true);
      assert.equal(policy.enableFastPath, true);
      assert.equal(policy.maxReviewRounds, 1);
    });

    it('standard策略应启用部分优化', () => {
      const policy = applyOptimizationPolicy('standard');

      assert.equal(policy.maxTokens, 60_000);
      assert.equal(policy.useCache, true);
      assert.equal(policy.dynamicCandidates, true);
      assert.equal(policy.enableFastPath, false);
      assert.equal(policy.maxReviewRounds, 2);
    });

    it('thorough策略应关闭所有优化', () => {
      const policy = applyOptimizationPolicy('thorough');

      assert.equal(policy.maxTokens, 120_000);
      assert.equal(policy.useCache, false);
      assert.equal(policy.dynamicCandidates, false);
      assert.equal(policy.enableFastPath, false);
      assert.equal(policy.maxReviewRounds, 3);
    });
  });

  describe('estimateTokenUsage', () => {
    it('应根据tier和complexity估算Token', () => {
      const minimalLow = estimateTokenUsage('minimal', 'low');
      assert.ok(minimalLow.avg < 20_000, 'minimal+low应<20k');

      const standardMedium = estimateTokenUsage('standard', 'medium');
      assert.ok(standardMedium.avg >= 30_000 && standardMedium.avg <= 50_000, 'standard+medium应在30k-50k');

      const thoroughHigh = estimateTokenUsage('thorough', 'high');
      assert.ok(thoroughHigh.avg >= 100_000, 'thorough+high应>=100k');
    });

    it('thorough策略的Token应最高', () => {
      const minimal = estimateTokenUsage('minimal', 'medium');
      const standard = estimateTokenUsage('standard', 'medium');
      const thorough = estimateTokenUsage('thorough', 'medium');

      assert.ok(minimal.avg < standard.avg);
      assert.ok(standard.avg < thorough.avg);
    });
  });

  describe('estimateCost', () => {
    it('应正确计算成本', () => {
      assert.equal(estimateCost(100_000), 0.25); // 100k tokens = $0.25
      assert.equal(estimateCost(1_000_000), 2.5); // 1M tokens = $2.50
      assert.equal(estimateCost(50_000), 0.125); // 50k tokens = $0.125
    });

    it('应保留4位小数', () => {
      const cost = estimateCost(123_456);
      assert.equal(typeof cost, 'number');
      assert.ok(cost.toString().split('.')[1]?.length <= 4);
    });
  });

  describe('generateBudgetRecommendation', () => {
    it('应生成完整的预算建议', () => {
      const recommendation = generateBudgetRecommendation(
        { maxTokens: 60_000, maxCostUsd: 3, maxRounds: 2, maxTasks: 10 },
        'medium'
      );

      assert.equal(recommendation.tier, 'standard');
      assert.equal(recommendation.complexity, 'medium');
      assert.ok(recommendation.policy.useCache);
      assert.ok(recommendation.tokenEstimate.avg > 0);
      assert.ok(recommendation.costEstimate > 0);
      assert.ok(recommendation.summary.includes('standard'));
      assert.ok(recommendation.summary.includes('medium'));
    });

    it('未提供budget应使用standard默认值', () => {
      const recommendation = generateBudgetRecommendation(undefined, 'low');

      assert.equal(recommendation.tier, 'standard');
    });
  });

  describe('BUDGET_POLICIES常量', () => {
    it('应包含三个tier的配置', () => {
      assert.ok(BUDGET_POLICIES.minimal);
      assert.ok(BUDGET_POLICIES.standard);
      assert.ok(BUDGET_POLICIES.thorough);
    });

    it('maxTokens应递增', () => {
      assert.ok(BUDGET_POLICIES.minimal.maxTokens < BUDGET_POLICIES.standard.maxTokens);
      assert.ok(BUDGET_POLICIES.standard.maxTokens < BUDGET_POLICIES.thorough.maxTokens);
    });

    it('maxReviewRounds应递增', () => {
      assert.ok(BUDGET_POLICIES.minimal.maxReviewRounds <= BUDGET_POLICIES.standard.maxReviewRounds);
      assert.ok(BUDGET_POLICIES.standard.maxReviewRounds <= BUDGET_POLICIES.thorough.maxReviewRounds);
    });
  });
});
