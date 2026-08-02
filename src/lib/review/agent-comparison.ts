import type { BudgetState, ClarificationRequest, RequirementAnalysis, ExecutionPlan } from "@/lib/planner/contracts";
import { generateStructuredOutput } from "@/lib/planner/structured-output";
import { planRequirement } from "@/lib/planner/planner-service";
import { PLANNER_SYSTEM_RULES } from "@/lib/planner/prompts";
import type { z } from "zod";
import {
  CandidateSolutionSchema,
  EvaluationResultSchema,
  ReviewBudgetSchema,
  ReviewResultSchema,
  type CandidateSolution,
  type ReviewBudget,
} from "./contracts";
import type { LightweightCase } from "./lightweight-case-manifest";
import { buildCandidatePrompt, buildEvaluationPrompt, buildReviewPrompt, buildRevisionPrompt, REVIEW_SYSTEM_RULES } from "./prompts";
import { runReviewWorkflow, type ReviewGenerators, type ReviewWorkflowResult } from "./review-service";

/**
 * Pure orchestration for Stage 5's single-agent vs multi-agent comparison.
 *
 * This module knows nothing about LongCat, `.env`, network calls, or cost —
 * every model call is routed through the injected `callModel`, so tests can
 * supply a deterministic fake and the real CLI script (scripts/agent-comparison.ts)
 * can supply a network-backed one (see longcat-client.ts).
 */
export type ModelCallResult = { content: string; inputTokens: number; outputTokens: number };
export type CallModel = (roleId: string, systemPrompt: string, userPrompt: string) => Promise<ModelCallResult>;

const SINGLE_AGENT_SYSTEM_PROMPT = [
  "You are a single senior engineer producing one complete solution for a web project requirement, with no other collaborators or review step.",
  "Write one complete, actionable solution covering scope, key architecture decisions, constraint handling, risks and mitigations, implementation steps, and acceptance criteria.",
  "Make reasonable assumptions instead of asking clarifying questions, and state each assumption explicitly.",
  "Respond in the same language as the requirement. Output plain text only — no JSON, no Markdown code fences.",
].join("\n");

export type SingleAgentArmResult = { solutionText: string };

export async function runSingleAgentArm(input: { requirement: string; callModel: CallModel }): Promise<SingleAgentArmResult> {
  const result = await input.callModel("single-agent", SINGLE_AGENT_SYSTEM_PROMPT, input.requirement);
  return { solutionText: result.content };
}

/** 四组消融实验的冻结变体名；任何新增组都必须先更新协议与测试。 */
export const ABLATION_VARIANTS = [
  "single_agent",
  "dual_candidate_no_review",
  "single_candidate_with_review",
  "full_multi_agent",
] as const;

export type AblationVariant = (typeof ABLATION_VARIANTS)[number];

export type AblationArmResult = {
  variant: AblationVariant;
  status: "ready" | "needs_clarification";
  solutionText: string | null;
  analysis: RequirementAnalysis | null;
  plan: ExecutionPlan | null;
  candidateCount: number;
  reviewExecuted: boolean;
  evaluatorExecuted: boolean;
  reviewStatus: ReviewWorkflowResult["status"] | null;
  selectedCandidateId: string | null;
  decision: string | null;
  failures: Array<{ stage: string; code: string }>;
  assumptionRetryUsed: boolean;
};

async function callStructured<T>(callModel: CallModel, roleId: string, systemPrompt: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  return generateStructuredOutput({
    schema,
    prompt,
    maxAttempts: 2,
    generate: async (currentPrompt) => (await callModel(roleId, systemPrompt, currentPrompt)).content,
  });
}

function renderCandidateText(candidate: CandidateSolution): string {
  return [
    candidate.title,
    candidate.summary,
    ...candidate.decisions.map((decision) => `${decision.title}: ${decision.choice} (${decision.rationale})`),
    ...candidate.implementationSteps,
    ...candidate.risks,
    ...candidate.assumptions,
  ].join("\n");
}

/** Scores against the artifact a human would actually receive: the selected candidate, or both when escalated to needs_human. */
function renderMultiAgentSolutionText(result: ReviewWorkflowResult): string {
  const selected = result.candidates.find((candidate) => candidate.id === result.evaluation.selectedCandidateId);
  if (selected) return renderCandidateText(selected);
  return result.candidates.map(renderCandidateText).join("\n\n");
}

const ASSUMPTION_SYSTEM_PROMPT = [
  "你是需求分析助手，负责在缺少关键信息时给出合理假设，而不是反问用户。",
  "针对给出的每个澄清问题，输出一条以“假设：”开头的合理假设作答，逐行输出，且严格按问题顺序一一对应。",
  "不要输出编号、JSON 或 Markdown，也不要输出问题原文以外的解释性内容。",
].join("\n");

function buildAssumptionUserPrompt(requirement: string, clarification: ClarificationRequest): string {
  const questionsText = clarification.questions
    .map((question, index) => `${index + 1}. ${question.question}（原因：${question.reason}）`)
    .join("\n");
  return `项目需求：\n${requirement}\n\n需要澄清的问题：\n${questionsText}`;
}

/** Mirrors the single-agent arm's "assume instead of ask" rule so a stricter clarification gate doesn't unfairly starve the multi-agent arm of scoreable output. */
async function answerClarificationWithAssumptions(callModel: CallModel, requirement: string, clarification: ClarificationRequest): Promise<string> {
  const result = await callModel("planner:assumptions", ASSUMPTION_SYSTEM_PROMPT, buildAssumptionUserPrompt(requirement, clarification));
  return result.content.trim();
}

function buildAugmentedRequirement(requirement: string, assumptionAnswers: string): string {
  return [requirement, "", "补充假设（用于弥补上述澄清问题，非用户已确认信息，仅供本次评测生成方案使用）：", assumptionAnswers].join("\n");
}

async function preparePlanForAblation(input: {
  requirement: string;
  callModel: CallModel;
  plannerBudget?: BudgetState;
}) {
  const generate = ({ stage, prompt }: { stage: "analysis" | "plan"; prompt: string }) =>
    input.callModel(`planner:${stage}`, PLANNER_SYSTEM_RULES, prompt).then((result) => result.content);

  let plannerResult = await planRequirement({ requirement: input.requirement, budget: input.plannerBudget, generate });
  let assumptionRetryUsed = false;
  if (plannerResult.status === "needs_clarification") {
    const assumptionAnswers = await answerClarificationWithAssumptions(input.callModel, input.requirement, plannerResult.clarification);
    plannerResult = await planRequirement({
      requirement: buildAugmentedRequirement(input.requirement, assumptionAnswers),
      budget: input.plannerBudget,
      generate,
      // 评测的单 Agent 臂同样要求自行声明假设；这里最多补一次并强制向前。
      bypassClarificationGate: true,
    });
    assumptionRetryUsed = true;
  }
  return { plannerResult, assumptionRetryUsed };
}

function createReviewGenerators(callModel: CallModel): ReviewGenerators {
  return {
    candidate: (value) => callStructured(callModel, `candidate:${value.orientation}`, REVIEW_SYSTEM_RULES, buildCandidatePrompt(value), CandidateSolutionSchema),
    review: (value) => callStructured(callModel, "review", REVIEW_SYSTEM_RULES, buildReviewPrompt(value), ReviewResultSchema),
    evaluate: (value) => callStructured(callModel, "evaluate", REVIEW_SYSTEM_RULES, buildEvaluationPrompt(value), EvaluationResultSchema),
    revise: (value) => callStructured(callModel, `revise:${value.round}`, REVIEW_SYSTEM_RULES, buildRevisionPrompt(value), CandidateSolutionSchema),
  };
}

function renderCandidateBundle(candidates: CandidateSolution[]): string {
  // B 组不引入隐式选择器：保留两个独立候选，供同一 checklist 评估其可见产物。
  return candidates.map((candidate) => `[${candidate.orientation}]\n${renderCandidateText(candidate)}`).join("\n\n");
}

/**
 * 按冻结协议运行单个消融变体。除 A 组外，所有组共享同一 Planner、预算和自生成假设规则；
 * B 组刻意跳过 Review / Evaluator，C 与 D 只在 Candidate 数量上不同。
 */
export async function runAblationArm(input: {
  variant: AblationVariant;
  requirement: string;
  callModel: CallModel;
  plannerBudget?: BudgetState;
  reviewBudget?: ReviewBudget;
}): Promise<AblationArmResult> {
  if (input.variant === "single_agent") {
    const result = await runSingleAgentArm({ requirement: input.requirement, callModel: input.callModel });
    return {
      variant: input.variant, status: "ready", solutionText: result.solutionText, candidateCount: 0,
      analysis: null, plan: null,
      reviewExecuted: false, evaluatorExecuted: false, reviewStatus: null, selectedCandidateId: null,
      decision: null, failures: [], assumptionRetryUsed: false,
    };
  }

  const { plannerResult, assumptionRetryUsed } = await preparePlanForAblation(input);
  if (plannerResult.status === "needs_clarification") {
    return {
      variant: input.variant, status: "needs_clarification", solutionText: null, candidateCount: 0,
      analysis: null, plan: null,
      reviewExecuted: false, evaluatorExecuted: false, reviewStatus: null, selectedCandidateId: null,
      decision: null, failures: [], assumptionRetryUsed,
    };
  }

  const configuredBudget = ReviewBudgetSchema.parse({
    ...input.reviewBudget,
    // 旧入口可显式传入 1 保持兼容；正式 D 组不传时固定使用两个独立候选。
    maxCandidates: input.variant === "single_candidate_with_review" ? 1 : input.reviewBudget?.maxCandidates ?? 2,
  });
  const generators = createReviewGenerators(input.callModel);

  if (input.variant === "dual_candidate_no_review") {
    const orientations = ["delivery", "quality"] as const;
    const settled = await Promise.allSettled(orientations.map((orientation) => generators.candidate!({
      orientation, analysis: plannerResult.analysis, plan: plannerResult.plan,
    })));
    const candidates = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failures = settled.flatMap((result, index) => result.status === "rejected"
      ? [{ stage: `candidate:${orientations[index]}`, code: "CANDIDATE_FAILED" }]
      : []);
    return {
      variant: input.variant, status: "ready", solutionText: candidates.length ? renderCandidateBundle(candidates) : "",
      analysis: plannerResult.analysis, plan: plannerResult.plan,
      candidateCount: candidates.length, reviewExecuted: false, evaluatorExecuted: false, reviewStatus: null,
      selectedCandidateId: null, decision: null, failures, assumptionRetryUsed,
    };
  }

  const reviewResult = await runReviewWorkflow({
    analysis: plannerResult.analysis,
    plan: plannerResult.plan,
    budget: configuredBudget,
    generators,
  });
  return {
    variant: input.variant,
    status: "ready",
    solutionText: renderMultiAgentSolutionText(reviewResult),
    analysis: plannerResult.analysis,
    plan: plannerResult.plan,
    candidateCount: reviewResult.candidates.length,
    // 没有成功候选时 ReviewWorkflow 会提前返回；这里记录实际执行的阶段，而非配置意图。
    reviewExecuted: reviewResult.candidates.length > 0,
    evaluatorExecuted: reviewResult.candidates.length > 0,
    reviewStatus: reviewResult.status,
    selectedCandidateId: reviewResult.evaluation.selectedCandidateId,
    decision: reviewResult.evaluation.decision,
    failures: reviewResult.failures,
    assumptionRetryUsed,
  };
}

export type MultiAgentArmResult =
  | { status: "needs_clarification"; solutionText: null }
  | { status: "ready"; reviewStatus: ReviewWorkflowResult["status"]; selectedCandidateId: string | null; solutionText: string; analysis: RequirementAnalysis; plan: ExecutionPlan; assumptionRetryUsed: boolean };

export async function runMultiAgentArm(input: {
  requirement: string;
  callModel: CallModel;
  plannerBudget?: BudgetState;
  reviewBudget?: ReviewBudget;
}): Promise<MultiAgentArmResult> {
  const result = await runAblationArm({ ...input, variant: "full_multi_agent" });
  if (result.status === "needs_clarification") {
    return { status: "needs_clarification", solutionText: null };
  }
  if (!result.analysis || !result.plan) throw new Error("ABLATION_PLAN_MISSING");
  return {
    status: "ready",
    reviewStatus: result.reviewStatus ?? "inconclusive",
    selectedCandidateId: result.selectedCandidateId,
    solutionText: result.solutionText ?? "",
    analysis: result.analysis,
    plan: result.plan,
    assumptionRetryUsed: result.assumptionRetryUsed,
  };
}

export type CaseComparisonResult = {
  caseId: LightweightCase["caseId"];
  category: LightweightCase["category"];
  singleAgent: { status: "ok"; solutionText: string } | { status: "error"; error: string };
  multiAgent:
    | { status: "ready"; reviewStatus: ReviewWorkflowResult["status"]; solutionText: string; assumptionRetryUsed: boolean }
    | { status: "needs_clarification" }
    | { status: "error"; error: string };
};

/** Runs both arms for one case. A failure in one arm never masks the other arm's real result. */
export async function runCaseComparison(input: {
  testCase: LightweightCase;
  singleAgentCallModel: CallModel;
  multiAgentCallModel: CallModel;
  plannerBudget?: BudgetState;
  reviewBudget?: ReviewBudget;
}): Promise<CaseComparisonResult> {
  const [singleAgentSettled, multiAgentSettled] = await Promise.allSettled([
    runSingleAgentArm({ requirement: input.testCase.requirement, callModel: input.singleAgentCallModel }),
    runMultiAgentArm({
      requirement: input.testCase.requirement,
      callModel: input.multiAgentCallModel,
      plannerBudget: input.plannerBudget,
      reviewBudget: input.reviewBudget,
    }),
  ]);

  const singleAgent: CaseComparisonResult["singleAgent"] = singleAgentSettled.status === "fulfilled"
    ? { status: "ok", solutionText: singleAgentSettled.value.solutionText }
    : { status: "error", error: singleAgentSettled.reason instanceof Error ? singleAgentSettled.reason.message : String(singleAgentSettled.reason) };

  const multiAgent: CaseComparisonResult["multiAgent"] = multiAgentSettled.status === "rejected"
    ? { status: "error", error: multiAgentSettled.reason instanceof Error ? multiAgentSettled.reason.message : String(multiAgentSettled.reason) }
    : multiAgentSettled.value.status === "needs_clarification"
      ? { status: "needs_clarification" }
      : { status: "ready", reviewStatus: multiAgentSettled.value.reviewStatus, solutionText: multiAgentSettled.value.solutionText, assumptionRetryUsed: multiAgentSettled.value.assumptionRetryUsed };

  return { caseId: input.testCase.caseId, category: input.testCase.category, singleAgent, multiAgent };
}
