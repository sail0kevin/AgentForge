import type { RequirementAnalysis, ExecutionPlan } from '@/lib/planner/contracts';

/**
 * 需求复杂度评分结果
 */
export interface ComplexityScore {
  /** 综合评分 (0-100) */
  score: number;
  /** 复杂度等级 */
  level: 'low' | 'medium' | 'high';
  /** 评分原因列表 */
  reasons: string[];
  /** 推荐生成的候选方案数量 */
  recommendedCandidates: 1 | 2;
  /** 各维度得分明细 */
  breakdown: {
    taskCount: number;
    missingInfo: number;
    techStack: number;
    evalDimensions: number;
    constraints: number;
  };
}

/**
 * 评估需求的复杂度
 *
 * 基于5个维度打分（总分100）：
 * 1. 任务数量 (0-25分)
 * 2. 缺失关键信息 (0-20分)
 * 3. 技术栈复杂度 (0-20分)
 * 4. 评估维度 (0-15分)
 * 5. 约束条件 (0-20分)
 *
 * 判定规则：
 * - score >= 60: high (双候选)
 * - score >= 35: medium (双候选)
 * - score < 35: low (单候选)
 *
 * 核心优化：低复杂度需求使用单候选，节省25-35% Token
 *
 * @param analysis - 需求分析结果
 * @param plan - 执行计划
 * @returns 复杂度评分和推荐策略
 */
export function scoreRequirementComplexity(
  analysis: RequirementAnalysis,
  plan: ExecutionPlan
): ComplexityScore {
  let score = 0;
  const reasons: string[] = [];
  const breakdown = {
    taskCount: 0,
    missingInfo: 0,
    techStack: 0,
    evalDimensions: 0,
    constraints: 0,
  };

  // 维度1: 任务数量 (0-25分)
  const taskCount = plan.tasks.length;
  if (taskCount >= 8) {
    breakdown.taskCount = 25;
    score += 25;
    reasons.push(`任务数量多(${taskCount}个)`);
  } else if (taskCount >= 5) {
    breakdown.taskCount = 15;
    score += 15;
  } else {
    breakdown.taskCount = 5;
    score += 5;
  }

  // 维度2: 缺失关键信息 (0-20分)
  const missingRequired = analysis.missingInformation.filter(m => m.required);
  if (missingRequired.length >= 3) {
    breakdown.missingInfo = 20;
    score += 20;
    reasons.push(`关键信息缺失${missingRequired.length}项`);
  } else if (missingRequired.length >= 1) {
    breakdown.missingInfo = 10;
    score += 10;
  }

  // 维度3: 技术栈复杂度 (0-20分)
  const uniqueSections = new Set(
    plan.tasks.flatMap(t => t.reportSectionIds)
  ).size;
  if (uniqueSections >= 6) {
    breakdown.techStack = 20;
    score += 20;
    reasons.push(`涉及${uniqueSections}个技术模块`);
  } else if (uniqueSections >= 3) {
    breakdown.techStack = 10;
    score += 10;
  }

  // 维度4: 评估维度 (0-15分)
  const evalDims = plan.evaluationDimensions.length;
  if (evalDims >= 6) {
    breakdown.evalDimensions = 15;
    score += 15;
    reasons.push(`评估维度多(${evalDims}个)`);
  } else if (evalDims >= 4) {
    breakdown.evalDimensions = 8;
    score += 8;
  }

  // 维度5: 约束条件 (0-20分)
  const constraints = analysis.constraints?.length ?? 0;
  if (constraints >= 5) {
    breakdown.constraints = 20;
    score += 20;
    reasons.push(`约束条件${constraints}个`);
  } else if (constraints >= 2) {
    breakdown.constraints = 10;
    score += 10;
  }

  // 复杂度等级判定
  let level: 'low' | 'medium' | 'high';
  let recommendedCandidates: 1 | 2;

  if (score >= 60) {
    level = 'high';
    recommendedCandidates = 2;
    if (reasons.length === 0) {
      reasons.push('综合评分高，建议双候选');
    }
  } else if (score >= 35) {
    level = 'medium';
    recommendedCandidates = 2;
  } else {
    level = 'low';
    recommendedCandidates = 1;
    reasons.push('复杂度低，单候选即可');
  }

  return {
    score,
    level,
    reasons,
    recommendedCandidates,
    breakdown,
  };
}

/**
 * 批量评分（用于消融实验分析）
 *
 * @param items - 需求分析和计划对列表
 * @returns 复杂度评分列表
 */
export function batchScoreComplexity(
  items: Array<{ analysis: RequirementAnalysis; plan: ExecutionPlan }>
): ComplexityScore[] {
  return items.map(item => scoreRequirementComplexity(item.analysis, item.plan));
}

/**
 * 生成复杂度分布统计
 *
 * @param scores - 复杂度评分列表
 * @returns 统计摘要
 */
export function summarizeComplexityDistribution(scores: ComplexityScore[]) {
  const total = scores.length;
  const low = scores.filter(s => s.level === 'low').length;
  const medium = scores.filter(s => s.level === 'medium').length;
  const high = scores.filter(s => s.level === 'high').length;
  const singleCandidateCount = scores.filter(s => s.recommendedCandidates === 1).length;

  const avgScore = total > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / total
    : 0;

  return {
    total,
    distribution: {
      low: { count: low, percentage: ((low / total) * 100).toFixed(1) + '%' },
      medium: { count: medium, percentage: ((medium / total) * 100).toFixed(1) + '%' },
      high: { count: high, percentage: ((high / total) * 100).toFixed(1) + '%' },
    },
    singleCandidateCount,
    singleCandidatePercentage: ((singleCandidateCount / total) * 100).toFixed(1) + '%',
    avgScore: Number(avgScore.toFixed(1)),
  };
}
