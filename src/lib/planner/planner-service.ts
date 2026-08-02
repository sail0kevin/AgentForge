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

export const DEFAULT_PLANNER_BUDGET: BudgetState = { maxTokens: 60_000, maxCostUsd: 5, maxRounds: 2, maxTasks: 12 };

export type PlannerGenerate = (input: { stage: "analysis" | "plan"; prompt: string; attempt: number }) => Promise<string>;

export type PlannerResult =
  | { status: "ready"; analysis: RequirementAnalysis; plan: ExecutionPlan; reportOutline: ReportSection[] }
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
}): Promise<PlannerResult> {
  const requirement = input.requirement.trim();
  if (!requirement) throw new Error("REQUIREMENT_EMPTY");
  const budget = BudgetStateSchema.parse(input.budget ?? DEFAULT_PLANNER_BUDGET);
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
  return { status: "ready", analysis, plan, reportOutline: plan.reportSections };
}
