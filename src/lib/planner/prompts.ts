import { z } from "zod";
import { ExecutionPlanSchema, RequirementAnalysisSchema, type BudgetState, type RequirementAnalysis } from "./contracts";

export const PLANNER_SYSTEM_RULES = [
  "你是 AgentForge 的需求规划器。",
  "只输出 JSON，不输出 Markdown、解释或代码围栏。",
  "不得虚构用户已经确认的事实；关键资料不足时必须写入 missingInformation。",
  "计划中的 Agent、工具、依赖、轮次和预算最终均由服务端校验。",
].join("\n");

export function buildRequirementAnalysisPrompt(requirement: string) {
  return `${PLANNER_SYSTEM_RULES}\n\n任务：分析下面的 Web 项目需求，输出 schemaVersion=1 的 RequirementAnalysis。\n\nJSON Schema：\n${JSON.stringify(z.toJSONSchema(RequirementAnalysisSchema))}\n\n用户需求：\n${requirement}`;
}

export function buildExecutionPlanPrompt(analysis: RequirementAnalysis, budget: BudgetState) {
  return `${PLANNER_SYSTEM_RULES}\n\n任务：根据需求分析生成 schemaVersion=1 的 ExecutionPlan。报告目录必须随项目类型变化，每个任务必须关联至少一个报告章节。\n\nJSON Schema：\n${JSON.stringify(z.toJSONSchema(ExecutionPlanSchema))}\n\n预算边界：\n${JSON.stringify(budget)}\n\n需求分析：\n${JSON.stringify(analysis)}`;
}
