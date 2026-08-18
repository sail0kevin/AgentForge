import { z } from "zod";
import type { ExecutionPlan, RequirementAnalysis } from "@/lib/planner/contracts";
import { CandidateSolutionSchema, EvaluationResultSchema, ReviewResultSchema, SimplifiedReviewResultSchema, type CandidateSolution, type Finding, type ReviewResult, type RubricDimension } from "./contracts";

export const REVIEW_SYSTEM_RULES = [
  "You are one role in AgentForge's evidence-first cross-review workflow.",
  "Return one JSON object only. Do not use Markdown fences or explanatory text.",
  // 缺少这条约束时，英文系统提示会与中文 Planner 输出争夺输出语言，最终产物约半数漂移成英文；
  // 下游 checklist 是关键词子串匹配，漂移会让覆盖率被记成 0，把架构对比污染成语言对比。
  "Write every natural-language field in the same language as the supplied requirement, analysis, and plan. JSON keys and enum values stay exactly as the schema defines them.",
  "Do not invent confirmed facts. References must point to plan tasks, report sections, or evidence already present in the candidate.",
  "A severe opinion without a usable evidence reference is not blocking evidence.",
  "Do not decide high-impact delivery-versus-quality conflicts on the user's behalf.",
].join("\n");

function contract(schema: z.ZodType) {
  return JSON.stringify(z.toJSONSchema(schema));
}

export function buildCandidatePrompt(input: { orientation: "delivery" | "quality"; analysis: RequirementAnalysis; plan: ExecutionPlan }) {
  const perspectiveRules = input.orientation === "delivery"
    ? "Prioritize earliest useful delivery, feedback cycle, scope control, and explicit repayment of deferred quality work."
    : "Prioritize safety gates, correctness, maintainability, observability, testability, and explicit release-risk control."
  return `${REVIEW_SYSTEM_RULES}\n\nCreate an independent ${input.orientation} candidate. You have not seen the other candidate. Set orientation exactly to ${input.orientation} and schemaVersion to 1. Apply this perspective rule: ${perspectiveRules} Do not merely rename the same proposal; make the tradeoffs visible in decisions, implementation steps, risks, and assumptions.\n\nJSON Schema:\n${contract(CandidateSolutionSchema)}\n\nRequirement analysis:\n${JSON.stringify(input.analysis)}\n\nExecution plan:\n${JSON.stringify(input.plan)}`;
}

export function buildReviewPrompt(input: { analysis: RequirementAnalysis; plan: ExecutionPlan; candidates: CandidateSolution[]; simplified?: boolean }) {
  const useSimplified = input.simplified ?? true; // 默认使用简化版

  if (useSimplified) {
    return `${REVIEW_SYSTEM_RULES}\n\nCross-review every candidate. Treat delivery and quality as independent perspectives, not as a requirement to manufacture disagreement. If the candidates are materially consistent and no supported high-impact problem exists, an empty findings list is valid.

Set overallAssessment:
- "no_major_issues": candidates are acceptable as-is, minor improvements possible but not blocking
- "needs_minor_revision": small fixes needed but core approach is sound
- "needs_major_revision": significant problems that must be addressed

For findings: use a simplified format with just id, candidateId, severity, and description (combine failure scenario and suggestion in one field). Use schemaVersion=1.

JSON Schema:\n${contract(SimplifiedReviewResultSchema)}\n\nRequirement analysis:\n${JSON.stringify(input.analysis)}\n\nExecution plan:\n${JSON.stringify(input.plan)}\n\nCandidates:\n${JSON.stringify(input.candidates)}`;
  }

  // 原始复杂版本（保留用于对比实验）
  return `${REVIEW_SYSTEM_RULES}\n\nCross-review every candidate. Treat delivery and quality as independent perspectives, not as a requirement to manufacture disagreement. If the candidates are materially consistent and no supported high-impact problem exists, an empty findings list is valid. Each Finding must include a concrete failure scenario, suggestion, candidate id, and evidenceRefs when evidence exists. Use schemaVersion=1.\n\nJSON Schema:\n${contract(ReviewResultSchema)}\n\nRequirement analysis:\n${JSON.stringify(input.analysis)}\n\nExecution plan:\n${JSON.stringify(input.plan)}\n\nCandidates:\n${JSON.stringify(input.candidates)}`;
}

export function buildEvaluationPrompt(input: { analysis: RequirementAnalysis; plan: ExecutionPlan; candidates: CandidateSolution[]; review: ReviewResult; rubric: RubricDimension[] }) {
  return `${REVIEW_SYSTEM_RULES}\n\nAct as Evaluator, not as a majority voter. Score every candidate against the supplied rubric. Put findings with empty evidenceRefs in ignoredFindingIds. Escalate unresolved high-impact tradeoffs as needs_human. Use schemaVersion=1.\n\nJSON Schema:\n${contract(EvaluationResultSchema)}\n\nRequirement analysis:\n${JSON.stringify(input.analysis)}\n\nExecution plan:\n${JSON.stringify(input.plan)}\n\nRubric:\n${JSON.stringify(input.rubric)}\n\nCandidates:\n${JSON.stringify(input.candidates)}\n\nReview:\n${JSON.stringify(input.review)}`;
}

export function buildRevisionPrompt(input: { candidate: CandidateSolution; findings: Finding[]; round: number }) {
  return `${REVIEW_SYSTEM_RULES}\n\nRevise only the supplied candidate for bounded round ${input.round}. Address supported findings with **minimal changes**: keep the core decisions, implementation steps, and assumptions unless directly contradicted by a Finding. Do not rewrite the entire candidate. Do not change its orientation or id. Use schemaVersion=1.\n\nJSON Schema:\n${contract(CandidateSolutionSchema)}\n\nCandidate:\n${JSON.stringify(input.candidate)}\n\nFindings:\n${JSON.stringify(input.findings)}`;
}
