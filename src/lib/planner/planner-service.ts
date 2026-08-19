import {
  BudgetStateSchema,
  ClarificationRequestSchema,
  ExecutionPlanSchema,
  RequirementAnalysisSchema,
  type BudgetState,
  type ClarificationRequest,
  type ExecutionPlan,
  type RequirementAnalysis,
  type ReportSection,
} from "./contracts";
import { analyzeRequirementBaseline, createBaselinePlan } from "./baseline-planner";
import { buildExecutionPlanPrompt, buildRequirementAnalysisPrompt } from "./prompts";
import { generateStructuredOutput } from "./structured-output";
import { validateExecutionPlan } from "./validation";
import { PlannerCache } from "./planner-cache";
import { scoreRequirementComplexity } from "@/lib/optimization/complexity-scorer";
import { selectBudgetTier, applyOptimizationPolicy } from "@/lib/optimization/budget-policy";

export const DEFAULT_PLANNER_BUDGET: BudgetState = { maxTokens: 60_000, maxCostUsd: 5, maxRounds: 2, maxTasks: 12 };

// 全局缓存实例（生产环境可考虑改为依赖注入）
const globalPlannerCache = new PlannerCache({ maxSize: 100, ttlMs: 3600000 });

export type PlannerGenerate = (input: { stage: "analysis" | "plan"; prompt: string; attempt: number }) => Promise<string>;

export type PlannerResult =
  | { status: "ready"; analysis: RequirementAnalysis; plan: ExecutionPlan; reportOutline: ReportSection[]; fromCache?: boolean; complexityScore?: number; recommendedCandidates?: 1 | 2 }
  | { status: "needs_clarification"; analysis: RequirementAnalysis; clarification: ClarificationRequest };

function clarificationFor(analysis: RequirementAnalysis): ClarificationRequest | null {
  const questions = analysis.missingInformation.filter((item) => item.required);
  if (questions.length === 0) return null;
  return ClarificationRequestSchema.parse({
    schemaVersion: 1,
    reason: "当前缺少会显著影响范围、流程或验收标准的关键信息。确认后再生成执行计划，可以减少模型猜测和返工。",
    questions,
  });
}

export async function planRequirement(input: {
  requirement: string;
  budget?: BudgetState;
  generate?: PlannerGenerate;
  maxAttempts?: number;
  /** Escape hatch for callers (e.g. Stage 5's evaluation harness) that already resolved clarification externally and must always get a plan back. Real product callers never set this, so the interactive clarification gate is unchanged for them. */
  bypassClarificationGate?: boolean;
  /** 是否启用缓存优化（默认启用） */
  useCache?: boolean;
  /** 是否启用动态候选数量优化（默认启用） */
  dynamicCandidates?: boolean;
}): Promise<PlannerResult> {
  const requirement = input.requirement.trim();
  if (!requirement) throw new Error("REQUIREMENT_EMPTY");
  const budget = BudgetStateSchema.parse(input.budget ?? DEFAULT_PLANNER_BUDGET);

  // 应用预算策略
  const tier = selectBudgetTier(budget);
  const policy = applyOptimizationPolicy(tier);
  const useCache = input.useCache ?? policy.useCache;
  const dynamicCandidates = input.dynamicCandidates ?? policy.dynamicCandidates;

  // 尝试从缓存读取
  if (useCache && input.generate) {
    const cached = await globalPlannerCache.get(requirement);
    if (cached) {
      // 缓存命中，直接返回
      const complexityScore = scoreRequirementComplexity(cached.analysis, cached.plan);
      return {
        status: "ready",
        analysis: cached.analysis,
        plan: cached.plan,
        reportOutline: cached.plan.reportSections,
        fromCache: true,
        complexityScore: complexityScore.score,
        recommendedCandidates: dynamicCandidates ? complexityScore.recommendedCandidates : 2,
      };
    }
  }

  const analysis = input.generate
    ? await generateStructuredOutput({
        schema: RequirementAnalysisSchema,
        prompt: buildRequirementAnalysisPrompt(requirement),
        generate: (prompt, attempt) => input.generate!({ stage: "analysis", prompt, attempt }),
        maxAttempts: input.maxAttempts,
      })
    : analyzeRequirementBaseline(requirement);

  const clarification = clarificationFor(analysis);
  if (clarification && !input.bypassClarificationGate) return { status: "needs_clarification", analysis, clarification };

  const plan = input.generate
    ? await generateStructuredOutput({
        schema: ExecutionPlanSchema,
        prompt: buildExecutionPlanPrompt(analysis, budget),
        generate: (prompt, attempt) => input.generate!({ stage: "plan", prompt, attempt }),
        validate: (value) => validateExecutionPlan(value, budget).issues,
        maxAttempts: input.maxAttempts,
      })
    : createBaselinePlan(analysis, budget);
  const validation = validateExecutionPlan(plan, budget);
  if (!validation.valid) throw new Error(`PLAN_VALIDATION_FAILED: ${validation.issues.join(" | ")}`);

  // 写入缓存
  if (useCache && input.generate) {
    await globalPlannerCache.set(requirement, analysis, plan);
  }

  // 计算复杂度评分
  const complexityScore = scoreRequirementComplexity(analysis, plan);

  return {
    status: "ready",
    analysis,
    plan,
    reportOutline: plan.reportSections,
    fromCache: false,
    complexityScore: complexityScore.score,
    recommendedCandidates: dynamicCandidates ? complexityScore.recommendedCandidates : 2,
  };
}
