import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRequirementComplexity, batchScoreComplexity, summarizeComplexityDistribution } from './complexity-scorer';
import { RequirementAnalysisSchema, ExecutionPlanSchema } from '@/lib/planner/contracts';

describe('ComplexityScorer', () => {
  describe('scoreRequirementComplexity', () => {
    it('简单需求应评为low并推荐单候选', () => {
      const analysis = RequirementAnalysisSchema.parse({
        schemaVersion: 1,
        projectType: 'website',
        summary: '简单需求摘要，包含基本的需求描述信息',
        goals: ['目标1'],
        targetUsers: ['用户群体1'],
        inScope: ['功能A'],
        outOfScope: [],
        assumptions: [],
        constraints: [],
        missingInformation: [],
        risks: [],
        complexity: 'low',
      });

      const plan = ExecutionPlanSchema.parse({
        schemaVersion: 1,
        title: '简单执行计划',
        rationale: '这是简单执行计划的原理说明',
        tasks: [
          { id: 'task-1', title: '任务1', description: '这是任务1的详细描述，包含足够的信息', agentRole: 'frontend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-1'] },
          { id: 'task-2', title: '任务2', description: '这是任务2的详细描述，包含足够的信息', agentRole: 'backend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-2'] },
        ],
        reportSections: [
          { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: ['task-2'] },
          { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: ['task-1'] },
        ],
        evaluationDimensions: ['需求覆盖', '技术可行性'],
        maxRounds: 2,
        estimatedTotalTokens: 10000,
        estimatedCostUsd: 0.5,
      });

      const result = scoreRequirementComplexity(analysis, plan);

      assert.equal(result.level, 'low', '简单需求应评为low');
      assert.equal(result.recommendedCandidates, 1, '应推荐单候选');
      assert.ok(result.score < 35, '评分应小于35');
      assert.ok(result.reasons.includes('复杂度低，单候选即可'));
    });

    it('中等复杂度需求应评为medium并推荐双候选', () => {
      const analysis = RequirementAnalysisSchema.parse({
        schemaVersion: 1,
        projectType: 'website',
        summary: '中等复杂度需求摘要，包含详细的需求描述信息',
        goals: ['目标1', '目标2'],
        targetUsers: ['用户群体1'],
        inScope: ['功能A', '功能B'],
        outOfScope: [],
        assumptions: [],
        constraints: ['约束1', '约束2'],
        missingInformation: [{ id: 'mi-1', question: '缺失问题1', reason: '缺失原因1', required: true }],
        risks: [],
        complexity: 'medium',
      });

      const plan = ExecutionPlanSchema.parse({
        schemaVersion: 1,
        title: '中等执行计划',
        rationale: '这是中等执行计划的原理说明',
        tasks: [
          { id: 'task-1', title: '任务1', description: '这是任务1的详细描述，包含足够的信息', agentRole: 'frontend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-1'] },
          { id: 'task-2', title: '任务2', description: '这是任务2的详细描述，包含足够的信息', agentRole: 'backend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-2'] },
          { id: 'task-3', title: '任务3', description: '这是任务3的详细描述，包含足够的信息', agentRole: 'data', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-3'] },
          { id: 'task-4', title: '任务4', description: '这是任务4的详细描述，包含足够的信息', agentRole: 'testing', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-4'] },
          { id: 'task-5', title: '任务5', description: '这是任务5的详细描述，包含足够的信息', agentRole: 'security', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-5'] },
        ],
        reportSections: [
          { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: ['task-2'] },
          { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: ['task-3'] },
        ],
        evaluationDimensions: ['需求覆盖', '技术可行性', '成本', '可维护性'],
        maxRounds: 2,
        estimatedTotalTokens: 20000,
        estimatedCostUsd: 1.0,
      });

      const result = scoreRequirementComplexity(analysis, plan);

      assert.equal(result.level, 'medium', '中等需求应评为medium');
      assert.equal(result.recommendedCandidates, 2, '应推荐双候选');
      assert.ok(result.score >= 35 && result.score < 60, '评分应在35-60之间');
    });

    it('高复杂度需求应评为high并推荐双候选', () => {
      const analysis = RequirementAnalysisSchema.parse({
        schemaVersion: 1,
        projectType: 'website',
        summary: '高复杂度需求摘要，包含详细的需求描述信息和背景',
        goals: ['目标1', '目标2', '目标3'],
        targetUsers: ['用户群体1', '用户群体2'],
        inScope: ['功能A', '功能B', '功能C'],
        outOfScope: [],
        assumptions: [],
        constraints: ['约束1', '约束2', '约束3', '约束4', '约束5'],
        missingInformation: [
          { id: 'mi-1', question: '缺失问题1', reason: '缺失原因1', required: true },
          { id: 'mi-2', question: '缺失问题2', reason: '缺失原因2', required: true },
          { id: 'mi-3', question: '缺失问题3', reason: '缺失原因3', required: true },
        ],
        risks: [],
        complexity: 'high',
      });

      const plan = ExecutionPlanSchema.parse({
        schemaVersion: 1,
        title: '高复杂度执行计划',
        rationale: '这是高复杂度执行计划的原理说明',
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i + 1}`,
          title: `任务${i + 1}`,
          description: '这是任务的详细描述，包含足够的信息来说明任务的具体内容',
          agentRole: 'frontend' as const,
          dependsOn: [],
          toolIds: [],
          estimatedTokens: 1000,
          reportSectionIds: [`sec-${i + 1}`],
        })),
        reportSections: [
          { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: ['task-2'] },
          { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: ['task-3'] },
        ],
        evaluationDimensions: ['需求覆盖', '技术可行性', '成本', '可维护性', '可测试性', '安全性', '性能'],
        maxRounds: 3,
        estimatedTotalTokens: 50000,
        estimatedCostUsd: 2.5,
      });

      const result = scoreRequirementComplexity(analysis, plan);

      assert.equal(result.level, 'high', '复杂需求应评为high');
      assert.equal(result.recommendedCandidates, 2, '应推荐双候选');
      assert.ok(result.score >= 60, '评分应>=60');
      assert.ok(result.reasons.length > 0, '应有评分原因');
    });

    it('评分明细应正确计算', () => {
      const analysis = RequirementAnalysisSchema.parse({
        schemaVersion: 1,
        projectType: 'website',
        summary: '评分明细测试需求摘要，包含详细的需求描述信息',
        goals: ['目标1'],
        targetUsers: ['用户群体1'],
        inScope: ['功能A'],
        outOfScope: [],
        assumptions: [],
        constraints: ['约束1', '约束2'],
        missingInformation: [{ id: 'mi-1', question: '缺失问题1', reason: '缺失原因1', required: true }],
        risks: [],
        complexity: 'medium',
      });

      const plan = ExecutionPlanSchema.parse({
        schemaVersion: 1,
        title: '评分明细测试计划',
        rationale: '这是评分明细测试计划的原理说明',
        tasks: Array.from({ length: 5 }, (_, i) => ({
          id: `task-${i + 1}`,
          title: `任务${i + 1}`,
          description: '这是任务的详细描述，包含足够的信息来说明任务的具体内容',
          agentRole: 'frontend' as const,
          dependsOn: [],
          toolIds: [],
          estimatedTokens: 1000,
          reportSectionIds: [`sec-${i + 1}`, `sec-${i + 2}`],
        })),
        reportSections: [
          { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: ['task-2'] },
          { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: ['task-3'] },
        ],
        evaluationDimensions: ['需求覆盖', '技术可行性', '成本', '可维护性'],
        maxRounds: 2,
        estimatedTotalTokens: 20000,
        estimatedCostUsd: 1.0,
      });

      const result = scoreRequirementComplexity(analysis, plan);

      assert.equal(result.breakdown.taskCount, 15, '5个任务应得15分');
      assert.equal(result.breakdown.missingInfo, 10, '1个缺失信息应得10分');
      assert.ok(result.breakdown.techStack > 0, '技术栈得分应>0');
      assert.equal(result.breakdown.evalDimensions, 8, '4个评估维度应得8分');
      assert.equal(result.breakdown.constraints, 10, '2个约束应得10分');

      const totalBreakdown =
        result.breakdown.taskCount +
        result.breakdown.missingInfo +
        result.breakdown.techStack +
        result.breakdown.evalDimensions +
        result.breakdown.constraints;

      assert.equal(totalBreakdown, result.score, '明细总分应等于总分');
    });

    it('边界情况：空计划应评为low', () => {
      const analysis = RequirementAnalysisSchema.parse({
        schemaVersion: 1,
        projectType: 'website',
        summary: '空计划测试需求摘要，包含足够的字符描述',
        goals: ['目标1'],
        targetUsers: ['用户群体1'],
        inScope: ['功能A'],
        outOfScope: [],
        assumptions: [],
        constraints: [],
        missingInformation: [],
        risks: [],
        complexity: 'low',
      });

      const plan = ExecutionPlanSchema.parse({
        schemaVersion: 1,
        title: '空计划测试',
        rationale: '这是空计划测试的原理说明',
        tasks: [
          { id: 'task-1', title: '任务1', description: '这是任务1的详细描述，包含足够的信息', agentRole: 'frontend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-1'] },
        ],
        reportSections: [
          { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: ['task-1'] },
          { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: ['task-1'] },
        ],
        evaluationDimensions: ['需求覆盖', '技术可行性'],
        maxRounds: 1,
        estimatedTotalTokens: 5000,
        estimatedCostUsd: 0.25,
      });

      const result = scoreRequirementComplexity(analysis, plan);

      assert.equal(result.level, 'low');
      assert.equal(result.recommendedCandidates, 1);
      assert.ok(result.score < 35);
    });
  });

  describe('batchScoreComplexity', () => {
    it('应批量评分多个需求', () => {
      const items = Array.from({ length: 3 }, (_, i) => ({
        analysis: RequirementAnalysisSchema.parse({
          schemaVersion: 1,
          projectType: 'website',
          summary: `批量测试需求${i}摘要，包含详细的需求描述信息`,
          goals: [`目标${i}`],
          targetUsers: ['用户群体1'],
          inScope: [`功能${i}`],
          outOfScope: [],
          assumptions: [],
          constraints: [],
          missingInformation: [],
          risks: [],
          complexity: 'low',
        }),
        plan: ExecutionPlanSchema.parse({
          schemaVersion: 1,
          title: `批量测试计划${i}`,
          rationale: '这是批量测试计划的原理说明',
          tasks: [{ id: `task-${i}`, title: `任务${i}`, description: '这是任务的详细描述，包含足够的信息来说明任务内容', agentRole: 'frontend', dependsOn: [], toolIds: [], estimatedTokens: 1000, reportSectionIds: ['sec-1'] }],
          reportSections: [
            { id: 'sec-1', title: '章节1', purpose: '章节1目的', order: 1, required: true, sourceTaskIds: [`task-${i}`] },
            { id: 'sec-2', title: '章节2', purpose: '章节2目的', order: 2, required: true, sourceTaskIds: [`task-${i}`] },
            { id: 'sec-3', title: '章节3', purpose: '章节3目的', order: 3, required: true, sourceTaskIds: [`task-${i}`] },
          ],
          evaluationDimensions: ['需求覆盖', '技术可行性'],
          maxRounds: 1,
          estimatedTotalTokens: 5000,
          estimatedCostUsd: 0.25,
        }),
      }));

      const results = batchScoreComplexity(items);

      assert.equal(results.length, 3);
      assert.ok(results.every(r => typeof r.score === 'number'));
      assert.ok(results.every(r => ['low', 'medium', 'high'].includes(r.level)));
    });
  });

  describe('summarizeComplexityDistribution', () => {
    it('应生成正确的统计摘要', () => {
      const scores = [
        { score: 20, level: 'low' as const, reasons: [], recommendedCandidates: 1 as const, breakdown: { taskCount: 5, missingInfo: 0, techStack: 0, evalDimensions: 0, constraints: 0 } },
        { score: 30, level: 'low' as const, reasons: [], recommendedCandidates: 1 as const, breakdown: { taskCount: 5, missingInfo: 0, techStack: 0, evalDimensions: 0, constraints: 0 } },
        { score: 45, level: 'medium' as const, reasons: [], recommendedCandidates: 2 as const, breakdown: { taskCount: 15, missingInfo: 0, techStack: 0, evalDimensions: 0, constraints: 0 } },
        { score: 50, level: 'medium' as const, reasons: [], recommendedCandidates: 2 as const, breakdown: { taskCount: 15, missingInfo: 0, techStack: 0, evalDimensions: 0, constraints: 0 } },
        { score: 70, level: 'high' as const, reasons: [], recommendedCandidates: 2 as const, breakdown: { taskCount: 25, missingInfo: 0, techStack: 0, evalDimensions: 0, constraints: 0 } },
      ];

      const summary = summarizeComplexityDistribution(scores);

      assert.equal(summary.total, 5);
      assert.equal(summary.distribution.low.count, 2);
      assert.equal(summary.distribution.medium.count, 2);
      assert.equal(summary.distribution.high.count, 1);
      assert.equal(summary.singleCandidateCount, 2);
      assert.equal(summary.singleCandidatePercentage, '40.0%');
      assert.equal(summary.avgScore, 43.0);
    });

    it('空列表应返回零统计', () => {
      const summary = summarizeComplexityDistribution([]);

      assert.equal(summary.total, 0);
      assert.equal(summary.avgScore, 0);
    });
  });
});
