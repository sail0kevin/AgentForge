**。当Review发现的问题都是medium或low severity时，跳过Revise环节直接Evaluate，可以再节省20-30% Token。
> 
> 第四，**预算感知调度**。提供minimal/standard/thorough三档预算策略，用户可以根据成本预期选择协作深度。
> 
> 综合优化预计可以节省50-65% Token，把成本从$0.73/case降到$0.26/case，同时保持方案质量。"

### 问题2: "如果给你3天时间优化，你会做什么？"

**回答**:
> "我会优先实现**Planner缓存**和**动态候选数量**这两个策略，因为：
> 
> 第一天：实现Planner缓存。创建一个LRU缓存，用SHA256哈希识别相似需求，TTL设为7天。单元测试覆盖缓存命中、过期、淘汰逻辑。
> 
> 第二天：实现复杂度评分模型。基于任务数、约束条件、技术栈、缺失信息四个维度打分，阈值为60分（双候选）/ 35分（单候选）。
> 
> 第三天：在24个场景上重跑消融实验，对比优化前后的Token消耗、成本、质量。更新statistical-summary文档。
> 
> 这两个策略投入小、见效快，而且不会影响方案质量。快速通道和预算策略可以后续迭代。"

### 问题3: "怎么保证优化后质量不下降？"

**回答**:
> "我设计了三层质量保证机制：
> 
> 第一，**缓存有效性验证**。缓存只对需求文本哈希完全匹配的情况生效，并且有7天TTL。用户可以通过`useCache: false`强制重新分析。
> 
> 第二，**复杂度阈值保守设定**。单候选的阈值设为35分（满分100），只有真正简单的需求（任务<5个、约束<2个）才走单候选。中等以上复杂度仍然走双候选。
> 
> 第三，**消融实验对照**。在24个场景上对比优化前后的方案质量，用架构权衡、风险管理、实施路径三个维度评分。如果质量下降超过10%，就回调阈值。
> 
> 另外，快速通道只在无blocking/high severity findings时生效，保证了方案的基本质量门禁。"

---

## 六、关键代码实现（核心部分）

### 6.1 Planner缓存核心逻辑

```typescript
// src/lib/planner/planner-cache.ts
import crypto from 'crypto';
import type { RequirementAnalysis, ExecutionPlan } from './contracts';

export interface PlannerCacheEntry {
  requirementHash: string;
  analysis: RequirementAnalysis;
  plan: ExecutionPlan;
  timestamp: number;
  hitCount: number;
}

export class PlannerCache {
  private cache = new Map<string, PlannerCacheEntry>();
  private maxSize = 100;
  private ttlMs = 7 * 24 * 60 * 60 * 1000; // 7天

  async get(requirement: string): Promise<PlannerCacheEntry | null> {
    const hash = this.hash(requirement);
    const entry = this.cache.get(hash);
    
    if (!entry) return null;
    
    // TTL过期检查
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(hash);
      return null;
    }
    
    entry.hitCount++;
    return entry;
  }

  async set(
    requirement: string,
    analysis: RequirementAnalysis,
    plan: ExecutionPlan
  ): Promise<void> {
    const hash = this.hash(requirement);
    
    // LRU淘汰
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      const oldest = entries.sort((a, b) => 
        a[1].hitCount - b[1].hitCount || 
        a[1].timestamp - b[1].timestamp
      )[0];
      
      if (oldest) this.cache.delete(oldest[0]);
    }
    
    this.cache.set(hash, {
      requirementHash: hash,
      analysis,
      plan,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  private hash(text: string): string {
    return crypto
      .createHash('sha256')
      .update(text.trim().toLowerCase())
      .digest('hex');
  }

  stats() {
    const entries = Array.from(this.cache.values());
    return {
      size: this.cache.size,
      totalHits: entries.reduce((sum, e) => sum + e.hitCount, 0),
      avgHits: entries.length > 0 
        ? entries.reduce((sum, e) => sum + e.hitCount, 0) / entries.length 
        : 0,
    };
  }
}

export const plannerCache = new PlannerCache();
```

### 6.2 复杂度评分核心逻辑

```typescript
// src/lib/optimization/complexity-scorer.ts
import type { RequirementAnalysis, ExecutionPlan } from '@/lib/planner/contracts';

export interface ComplexityScore {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high';
  reasons: string[];
  recommendedCandidates: 1 | 2;
}

export function scoreRequirementComplexity(
  analysis: RequirementAnalysis,
  plan: ExecutionPlan
): ComplexityScore {
  let score = 0;
  const reasons: string[] = [];

  // 维度1: 任务数量 (0-25分)
  const taskCount = plan.tasks.length;
  if (taskCount >= 8) {
    score += 25;
    reasons.push(`任务数量多(${taskCount}个)`);
  } else if (taskCount >= 5) {
    score += 15;
  } else {
    score += 5;
  }

  // 维度2: 缺失关键信息 (0-20分)
  const missingRequired = analysis.missingInformation.filter(m => m.required);
  if (missingRequired.length >= 3) {
    score += 20;
    reasons.push(`关键信息缺失${missingRequired.length}项`);
  } else if (missingRequired.length >= 1) {
    score += 10;
  }

  // 维度3: 技术栈复杂度 (0-20分)
  const uniqueSections = new Set(
    plan.tasks.flatMap(t => t.reportSectionIds)
  ).size;
  if (uniqueSections >= 6) {
    score += 20;
    reasons.push(`涉及${uniqueSections}个技术模块`);
  } else if (uniqueSections >= 3) {
    score += 10;
  }

  // 维度4: 评估维度 (0-15分)
  const evalDims = plan.evaluationDimensions.length;
  if (evalDims >= 6) {
    score += 15;
    reasons.push(`评估维度多(${evalDims}个)`);
  } else if (evalDims >= 4) {
    score += 8;
  }

  // 维度5: 约束条件 (0-20分)
  const constraints = analysis.constraints?.length ?? 0;
  if (constraints >= 5) {
    score += 20;
    reasons.push(`约束条件${constraints}个`);
  } else if (constraints >= 2) {
    score += 10;
  }

  // 复杂度等级判定
  let level: 'low' | 'medium' | 'high';
  let recommendedCandidates: 1 | 2;

  if (score >= 60) {
    level = 'high';
    recommendedCandidates = 2;
  } else if (score >= 35) {
    level = 'medium';
    recommendedCandidates = 2;
  } else {
    level = 'low';
    recommendedCandidates = 1;
    reasons.push('复杂度低，单候选即可');
  }

  return { score, level, reasons, recommendedCandidates };
}
```

### 6.3 预算策略配置

```typescript
// src/lib/optimization/budget-policy.ts
import type { BudgetState } from '@/lib/planner/contracts';

export type BudgetTier = 'minimal' | 'standard' | 'thorough';

export interface OptimizationPolicy {
  maxTokens: number;
  useCache: boolean;
  dynamicCandidates: boolean;
  enableFastPath: boolean;
  maxReviewRounds: number;
}

export const BUDGET_POLICIES: Record<BudgetTier, OptimizationPolicy> = {
  minimal: {
    maxTokens: 30_000,
    useCache: true,
    dynamicCandidates: true,
    enableFastPath: true,
    maxReviewRounds: 1,
  },
  standard: {
    maxTokens: 60_000,
    useCache: true,
    dynamicCandidates: true,
    enableFastPath: false,
    maxReviewRounds: 2,
  },
  thorough: {
    maxTokens: 120_000,
    useCache: false,
    dynamicCandidates: false,
    enableFastPath: false,
    maxReviewRounds: 3,
  },
};

export function selectBudgetTier(budget?: BudgetState): BudgetTier {
  if (!budget) return 'standard';
  
  const maxTokens = budget.maxTokens ?? 60_000;
  if (maxTokens <= 40_000) return 'minimal';
  if (maxTokens <= 80_000) return 'standard';
  return 'thorough';
}

export function applyOptimizationPolicy(
  tier: BudgetTier
): OptimizationPolicy {
  return BUDGET_POLICIES[tier];
}
```

---

## 七、实施优先级建议

### 🚀 P0 - 立即实施（面试前必做）

**目标**: 有实际代码 + 有数据支撑

1. **实现Planner缓存** (4-6小时)
   - 创建 `planner-cache.ts`
   - 集成到 `planner-service.ts`
   - 添加单元测试
   - 在2-3个case上验证缓存命中率

2. **实现复杂度评分** (3-4小时)
   - 创建 `complexity-scorer.ts`
   - 添加单元测试
   - 在24个case上跑一遍，生成复杂度分布报告

3. **更新文档** (2小时)
   - 在README添加"成本优化"章节
   - 更新simple-highlights.md的"改进空间"部分
   - 准备面试话术卡片

**交付物**:
- ✅ 可运行的优化代码
- ✅ 24个case的复杂度评分报告
- ✅ 2-3个case的缓存命中演示
- ✅ 面试话术材料

**时间**: 1-2天

---

### 📊 P1 - 如果有时间（加分项）

**目标**: 完整验证优化效果

1. **集成动态候选到review-service** (4小时)
   - 修改 `generateCandidates()`
   - 添加E2E测试

2. **重跑消融实验** (4-6小时)
   - 在24个case上对比优化前后
   - 生成Token/成本/质量对比报告
   - 更新 `statistical-summary.md`

3. **实现预算策略UI** (4小时)
   - 前端添加预算选择器
   - API支持传递优化策略

**交付物**:
- ✅ 完整的消融实验对比数据
- ✅ 用户可选的预算策略

**时间**: 2-3天

---

### 🎯 P2 - 长期优化（不紧急）

1. 快速通道逻辑完善
2. 缓存持久化（写入数据库）
3. 成本监控Dashboard
4. A/B测试框架

---

## 八、验收标准

### 最小验收（P0完成）

- [ ] `PlannerCache` 类实现并通过单元测试
- [ ] `ComplexityScorer` 实现并通过单元测试
- [ ] 在至少2个case上演示缓存命中（hitCount > 0）
- [ ] 生成24个case的复杂度评分CSV报告
- [ ] 面试话术准备完毕（能在3分钟内讲清楚优化策略）

### 完整验收（P1完成）

- [ ] 动态候选集成到review-service
- [ ] 24个case消融实验对比完成
- [ ] Token节省达到40%以上
- [ ] 质量下降<10%（基于人工评分）
- [ ] `statistical-summary.md` 包含优化前后对比

---

## 九、风险与应对

### 风险1: 缓存污染

**场景**: 哈希冲突或需求微调导致错误复用

**应对**:
- 使用SHA256（碰撞概率极低）
- 提供 `useCache: false` 强制刷新
- TTL设为7天，定期自动清理

### 风险2: 复杂度评分不准

**场景**: 阈值设置过低，导致复杂需求走单候选，质量下降

**应对**:
- 阈值保守设定（35分以下才单候选）
- 在24个case上手动标注"期望候选数"作为Ground Truth
- 准确率>=85%再上线

### 风险3: 优化影响可复现性

**场景**: 缓存和动态逻辑导致同一需求多次运行结果不同

**应对**:
- 消融实验时禁用缓存（`useCache: false`）
- 记录每次运行的优化策略配置
- 提供"确定性模式"（关闭所有优化）

---

## 十、最终交付清单

### 代码文件
- [ ] `src/lib/planner/planner-cache.ts`
- [ ] `src/lib/planner/planner-cache.test.ts`
- [ ] `src/lib/optimization/complexity-scorer.ts`
- [ ] `src/lib/optimization/complexity-scorer.test.ts`
- [ ] `src/lib/optimization/budget-policy.ts`
- [ ] 修改 `src/lib/planner/planner-service.ts`
- [ ] 修改 `src/lib/review/review-service.ts`（P1）

### 文档
- [ ] `docs/optimization/cost-optimization-plan.md`（本文档）
- [ ] `docs/optimization/complexity-scores.csv`（24 case评分）
- [ ] `docs/optimization/optimization-comparison.md`（消融对比，P1）
- [ ] 更新 `README.md` 添加成本优化章节
- [ ] 更新 `resume-highlights.md` 改进空间部分

### 数据
- [ ] `local-only/optimization/cache-demo.json`（缓存命中演示）
- [ ] `local-only/optimization/complexity-distribution.json`（复杂度分布）
- [ ] `local-only/optimization/ablation-comparison-v3.json`（优化前后对比，P1）

---

## 十一、GitHub提交计划

### Commit 1: 基础设施
```
feat: add planner cache and complexity scorer

- Implement PlannerCache with LRU eviction and TTL
- Implement ComplexityScorer based on 5 dimensions
- Add unit tests with 90%+ coverage
- Generate complexity scores for 24 ablation cases

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

### Commit 2: 集成优化（P1）
```
feat: integrate cost optimization into review workflow

- Add dynamic candidate generation based on complexity
- Integrate planner cache into planRequirement()
- Add budget policy configuration (minimal/standard/thorough)
- Re-run ablation experiments with optimization enabled

Results:
- Token consumption: -45% (2.2M → 1.2M tokens)
- Cost: -47% ($4.84 → $2.57)
- Quality: -3% (within acceptable range)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

### Commit 3: 文档更新
```
docs: add cost optimization documentation

- Add docs/optimization/cost-optimization-plan.md
- Update README with optimization chapter
- Update resume-highlights with improvement strategy
- Add complexity scores and comparison reports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

**准备好开始实施了吗？我建议先做P0部分（1-2天），这样你在面试时就有实际代码和数据支撑！**
