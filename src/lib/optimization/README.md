# 成本优化模块

本目录包含AgentForge多Agent系统的成本优化功能，通过三个核心模块实现Token消耗和成本的大幅降低。

## 核心模块

### 1. PlannerCache (planner-cache.ts)

**功能**: LRU缓存机制，避免重复分析相似需求

**特性**:
- SHA256哈希生成需求指纹
- LRU淘汰策略（基于命中次数和时间戳）
- TTL过期机制
- 命中计数统计

**使用示例**:
```typescript
const cache = new PlannerCache({ maxSize: 100, ttlMs: 3600000 });

// 写入缓存
await cache.set(requirement, analysis, plan);

// 读取缓存
const cached = await cache.get(requirement);
if (cached) {
  console.log(`缓存命中，已使用${cached.hitCount}次`);
}
```

**预期收益**: 相似需求命中缓存可节省100% Planner Token

---

### 2. ComplexityScorer (complexity-scorer.ts)

**功能**: 需求复杂度评分，动态决定候选方案数量（单候选 vs 双候选）

**评分维度**（总分100）:
1. 任务数量 (0-25分): >=8个任务得25分，>=5个得15分，<5个得5分
2. 缺失关键信息 (0-20分): >=3项得20分，>=1项得10分
3. 技术栈复杂度 (0-20分): >=6个模块得20分，>=3个得10分
4. 评估维度 (0-15分): >=6个维度得15分，>=4个得8分
5. 约束条件 (0-20分): >=5个约束得20分，>=2个得10分

**复杂度判定**:
- `score < 35`: **low** → 推荐单候选
- `35 <= score < 60`: **medium** → 推荐双候选
- `score >= 60`: **high** → 推荐双候选

**使用示例**:
```typescript
const result = scoreRequirementComplexity(analysis, plan);

console.log(`复杂度: ${result.level}`);
console.log(`推荐候选数: ${result.recommendedCandidates}`);
console.log(`评分: ${result.score}/100`);
console.log(`原因: ${result.reasons.join(', ')}`);
```

**预期收益**: 低复杂度需求使用单候选，节省25-35% Token

---

### 3. BudgetPolicy (budget-policy.ts)

**功能**: 三档预算策略，为不同使用场景提供优化配置

**预算档位**:

#### Minimal (最低成本)
- Token限制: 30k
- 优化策略: 全部启用（缓存、动态候选、快速通道）
- Review轮次: 1轮
- 预期成本: ~$0.18/case
- 适用场景: 快速验证、原型开发、低预算项目

#### Standard (标准质量，默认)
- Token限制: 60k
- 优化策略: 部分启用（缓存、动态候选）
- Review轮次: 2轮
- 预期成本: ~$0.40/case
- 适用场景: 大多数生产项目

#### Thorough (最高质量)
- Token限制: 120k
- 优化策略: 全部关闭，确保完整流程
- Review轮次: 3轮
- 预期成本: ~$0.73/case
- 适用场景: 关键项目、高复杂度需求

**使用示例**:
```typescript
// 自动选择预算档位
const tier = selectBudgetTier({ maxTokens: 50_000 }); // => 'standard'

// 应用优化策略
const policy = applyOptimizationPolicy(tier);
console.log(policy.useCache);           // => true
console.log(policy.dynamicCandidates);  // => true
console.log(policy.maxReviewRounds);    // => 2

// 生成预算建议
const recommendation = generateBudgetRecommendation(
  { maxTokens: 60_000, maxCostUsd: 3, maxRounds: 2, maxTasks: 10 },
  'medium'
);
console.log(recommendation.summary);
// => "standard策略 | 复杂度medium | 预计41250tokens | 约$0.103"
```

---

## 集成到工作流

### 1. Planner集成缓存

```typescript
// 在Planner节点中
const cached = await plannerCache.get(requirement);
if (cached && policy.useCache) {
  return cached; // 直接返回缓存结果
}

// 执行正常分析
const analysis = await analyzeRequirement(requirement);
const plan = await generatePlan(analysis);

// 写入缓存
await plannerCache.set(requirement, analysis, plan);
```

### 2. 候选数量动态调整

```typescript
// 在Proposer阶段前
const complexityScore = scoreRequirementComplexity(analysis, plan);

const candidateCount = policy.dynamicCandidates
  ? complexityScore.recommendedCandidates
  : 2; // 固定双候选

console.log(`生成${candidateCount}个候选方案`);
```

### 3. 工作流启动时应用预算策略

```typescript
// 工作流入口
const tier = selectBudgetTier(userBudget);
const policy = applyOptimizationPolicy(tier);

// 配置工作流
const workflow = createWorkflow({
  useCache: policy.useCache,
  dynamicCandidates: policy.dynamicCandidates,
  enableFastPath: policy.enableFastPath,
  maxReviewRounds: policy.maxReviewRounds,
  maxTokens: policy.maxTokens,
});
```

---

## 测试

运行测试：
```bash
npm run test:unit src/lib/optimization/*.test.ts src/lib/planner/planner-cache.test.ts
```

所有34个测试用例已通过验证。

---

## 预期综合收益

基于24场景消融实验的历史数据：

| 优化组合 | Token节省 | 成本节省 |
|---------|----------|---------|
| 仅缓存 | ~15% | ~15% |
| 仅动态候选 | ~25% | ~25% |
| 缓存 + 动态候选 | ~35% | ~35% |
| 全部优化（Minimal） | ~65% | ~65% |

**实际效果取决于**:
- 需求的相似度（缓存命中率）
- 低复杂度需求的占比（动态候选收益）
- 用户选择的预算档位

---

## 下一步

1. ✅ 实现三个核心模块
2. ✅ 编写完整测试用例
3. ⏳ 集成到实际工作流
4. ⏳ 运行消融实验验证实际收益
5. ⏳ 更新项目文档
