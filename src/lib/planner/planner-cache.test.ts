import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PlannerCache, type PlannerCacheEntry } from './planner-cache';
import { RequirementAnalysisSchema, ExecutionPlanSchema } from './contracts';

describe('PlannerCache', () => {
  let cache: PlannerCache;

  beforeEach(() => {
    cache = new PlannerCache({ maxSize: 3, ttlMs: 1000 });
  });

  const mockAnalysis = RequirementAnalysisSchema.parse({
    schemaVersion: 1,
    projectType: 'website',
    summary: '这是一个测试需求的摘要',
    goals: ['目标1', '目标2'],
    targetUsers: ['用户群体1'],
    inScope: ['功能A'],
    outOfScope: [],
    assumptions: [],
    constraints: [],
    missingInformation: [],
    risks: [],
    complexity: 'low',
  });

  const mockPlan = ExecutionPlanSchema.parse({
    schemaVersion: 1,
    title: '测试执行计划',
    rationale: '这是一个测试执行计划的原理说明',
    tasks: [{
      id: 'task-1',
      title: '任务1',
      description: '这是任务1的详细描述，包含足够的信息来说明任务的具体内容和实现方式',
      agentRole: 'frontend',
      dependsOn: [],
      toolIds: [],
      estimatedTokens: 1000,
      reportSectionIds: ['sec-1'],
    }],
    reportSections: [
      { id: 'sec-1', title: '章节1', purpose: '这是章节1的目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
      { id: 'sec-2', title: '章节2', purpose: '这是章节2的目的', order: 2, required: true, sourceTaskIds: ['task-1'] },
      { id: 'sec-3', title: '章节3', purpose: '这是章节3的目的', order: 3, required: true, sourceTaskIds: ['task-1'] },
    ],
    evaluationDimensions: ['需求覆盖', '技术可行性'],
    maxRounds: 2,
    estimatedTotalTokens: 10000,
    estimatedCostUsd: 0.5,
  });

  describe('基本缓存功能', () => {
    it('应该能存储和读取缓存', async () => {
      await cache.set('测试需求', mockAnalysis, mockPlan);
      const result = await cache.get('测试需求');

      assert.ok(result, '应该返回缓存结果');
      assert.deepEqual(result.analysis, mockAnalysis);
      assert.deepEqual(result.plan, mockPlan);
      assert.equal(result.hitCount, 1);
    });

    it('不存在的需求应返回null', async () => {
      const result = await cache.get('不存在的需求');
      assert.equal(result, null);
    });

    it('相同文本不同大小写应命中同一缓存', async () => {
      await cache.set('测试需求', mockAnalysis, mockPlan);
      const result1 = await cache.get('测试需求');
      const result2 = await cache.get('测试需求');
      const result3 = await cache.get('  测试需求  '); // 带空格

      assert.ok(result1);
      assert.ok(result2);
      assert.ok(result3);
      assert.equal(result1.requirementHash, result2.requirementHash);
      assert.equal(result2.requirementHash, result3.requirementHash);
    });
  });

  describe('命中计数', () => {
    it('每次get应增加hitCount', async () => {
      await cache.set('测试需求', mockAnalysis, mockPlan);

      const result1 = await cache.get('测试需求');
      assert.equal(result1?.hitCount, 1);

      const result2 = await cache.get('测试需求');
      assert.equal(result2?.hitCount, 2);

      const result3 = await cache.get('测试需求');
      assert.equal(result3?.hitCount, 3);
    });
  });

  describe('LRU淘汰策略', () => {
    it('缓存满时应淘汰最少使用的条目', async () => {
      // 填满缓存 (maxSize=3)
      await cache.set('需求A', mockAnalysis, mockPlan);
      await cache.set('需求B', mockAnalysis, mockPlan);
      await cache.set('需求C', mockAnalysis, mockPlan);

      // 增加A的命中次数
      await cache.get('需求A');
      await cache.get('需求A');

      // 增加B的命中次数
      await cache.get('需求B');

      // C的hitCount=0，应该被淘汰
      await cache.set('需求D', mockAnalysis, mockPlan);

      const resultA = await cache.get('需求A');
      const resultB = await cache.get('需求B');
      const resultC = await cache.get('需求C');
      const resultD = await cache.get('需求D');

      assert.ok(resultA, 'A应该保留（hitCount=2）');
      assert.ok(resultB, 'B应该保留（hitCount=1）');
      assert.equal(resultC, null, 'C应该被淘汰（hitCount=0）');
      assert.ok(resultD, 'D应该存在');
    });

    it('命中次数相同时应淘汰最早的条目', async () => {
      await cache.set('需求A', mockAnalysis, mockPlan);
      await new Promise(resolve => setTimeout(resolve, 10)); // 确保时间戳不同
      await cache.set('需求B', mockAnalysis, mockPlan);
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('需求C', mockAnalysis, mockPlan);

      // A、B、C的hitCount都是0，应该淘汰最早的A
      await cache.set('需求D', mockAnalysis, mockPlan);

      const resultA = await cache.get('需求A');
      const resultB = await cache.get('需求B');
      const resultC = await cache.get('需求C');
      const resultD = await cache.get('需求D');

      assert.equal(resultA, null, 'A应该被淘汰（最早）');
      assert.ok(resultB, 'B应该保留');
      assert.ok(resultC, 'C应该保留');
      assert.ok(resultD, 'D应该存在');
    });
  });

  describe('TTL过期', () => {
    it('过期条目应返回null', async () => {
      const shortTtlCache = new PlannerCache({ maxSize: 10, ttlMs: 50 });
      await shortTtlCache.set('测试需求', mockAnalysis, mockPlan);

      const result1 = await shortTtlCache.get('测试需求');
      assert.ok(result1, '立即读取应成功');

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 60));

      const result2 = await shortTtlCache.get('测试需求');
      assert.equal(result2, null, '过期后应返回null');
    });

    it('过期条目应从缓存中删除', async () => {
      const shortTtlCache = new PlannerCache({ maxSize: 10, ttlMs: 50 });
      await shortTtlCache.set('测试需求', mockAnalysis, mockPlan);

      const stats1 = shortTtlCache.stats();
      assert.equal(stats1.size, 1);

      await new Promise(resolve => setTimeout(resolve, 60));
      await shortTtlCache.get('测试需求'); // 触发过期检查

      const stats2 = shortTtlCache.stats();
      assert.equal(stats2.size, 0, '过期条目应被删除');
    });
  });

  describe('统计信息', () => {
    it('应返回正确的统计数据', async () => {
      await cache.set('需求A', mockAnalysis, mockPlan);
      await cache.set('需求B', mockAnalysis, mockPlan);

      await cache.get('需求A');
      await cache.get('需求A');
      await cache.get('需求B');

      const stats = cache.stats();
      assert.equal(stats.size, 2);
      assert.equal(stats.maxSize, 3);
      assert.equal(stats.totalHits, 3);
      assert.equal(stats.avgHits, 1.5);
    });

    it('空缓存的avgHits应为0', () => {
      const stats = cache.stats();
      assert.equal(stats.size, 0);
      assert.equal(stats.totalHits, 0);
      assert.equal(stats.avgHits, 0);
    });
  });

  describe('clear', () => {
    it('应清空所有缓存', async () => {
      await cache.set('需求A', mockAnalysis, mockPlan);
      await cache.set('需求B', mockAnalysis, mockPlan);

      const stats1 = cache.stats();
      assert.equal(stats1.size, 2);

      cache.clear();

      const stats2 = cache.stats();
      assert.equal(stats2.size, 0);

      const result = await cache.get('需求A');
      assert.equal(result, null);
    });
  });

  describe('entries', () => {
    it('应返回所有缓存条目', async () => {
      await cache.set('需求A', mockAnalysis, mockPlan);
      await cache.set('需求B', mockAnalysis, mockPlan);

      const entries = cache.entries();
      assert.equal(entries.length, 2);
      assert.ok(entries.every(e => e.requirementHash && e.analysis && e.plan));
    });
  });
});
