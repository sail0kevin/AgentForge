import type { BudgetState, ExecutionPlan } from "./contracts";
import { ExecutionPlanSchema } from "./contracts";

export const DEFAULT_PLANNER_AGENT_ROLES = new Set(["requirements", "architecture", "frontend", "backend", "data", "testing", "security", "reporter"]);
export const DEFAULT_PLANNER_TOOL_IDS = new Set(["knowledge-search", "ui-acceptance-check"]);

export type PlanValidationResult = { valid: boolean; issues: string[] };

function hasDependencyCycle(tasks: ExecutionPlan["tasks"]): boolean {
  const dependencies = new Map(tasks.map((task) => [task.id, new Set(task.dependsOn)]));
  const ready = [...dependencies].filter(([, values]) => values.size === 0).map(([id]) => id);
  let visited = 0;
  while (ready.length > 0) {
    const completed = ready.shift()!;
    visited += 1;
    for (const [id, values] of dependencies) {
      if (!values.delete(completed) || values.size !== 0) continue;
      ready.push(id);
    }
  }
  return visited !== tasks.length;
}

/** Planner输出只是建议；只有这个服务端语义校验通过后才能执行。 */
export function validateExecutionPlan(
  rawPlan: unknown,
  budget: BudgetState,
  options: { allowedAgentRoles?: Set<string>; allowedToolIds?: Set<string> } = {},
): PlanValidationResult {
  const parsed = ExecutionPlanSchema.safeParse(rawPlan);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const plan = parsed.data;
  const issues: string[] = [];
  const allowedRoles = options.allowedAgentRoles ?? DEFAULT_PLANNER_AGENT_ROLES;
  const allowedTools = options.allowedToolIds ?? DEFAULT_PLANNER_TOOL_IDS;
  const taskIds = new Set(plan.tasks.map((task) => task.id));
  const sectionIds = new Set(plan.reportSections.map((section) => section.id));

  if (taskIds.size !== plan.tasks.length) issues.push("Task IDs must be unique.");
  if (sectionIds.size !== plan.reportSections.length) issues.push("Report section IDs must be unique.");
  if (new Set(plan.reportSections.map((section) => section.order)).size !== plan.reportSections.length) issues.push("Report section order values must be unique.");
  if (plan.tasks.length > budget.maxTasks) issues.push(`Plan has ${plan.tasks.length} tasks but budget allows ${budget.maxTasks}.`);
  if (plan.maxRounds > budget.maxRounds) issues.push(`Plan requests ${plan.maxRounds} rounds but budget allows ${budget.maxRounds}.`);

  const taskTokenSum = plan.tasks.reduce((sum, task) => sum + task.estimatedTokens, 0);
  if (plan.estimatedTotalTokens !== taskTokenSum) issues.push("estimatedTotalTokens must equal the sum of task estimates.");
  if (plan.estimatedTotalTokens > budget.maxTokens) issues.push(`Plan requires ${plan.estimatedTotalTokens} tokens but budget allows ${budget.maxTokens}.`);
  if (plan.estimatedCostUsd > budget.maxCostUsd) issues.push(`Plan estimates $${plan.estimatedCostUsd} but budget allows $${budget.maxCostUsd}.`);

  for (const task of plan.tasks) {
    if (!allowedRoles.has(task.agentRole)) issues.push(`Task ${task.id} uses unauthorized agent role ${task.agentRole}.`);
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) issues.push(`Task ${task.id} depends on missing task ${dependency}.`);
      if (dependency === task.id) issues.push(`Task ${task.id} cannot depend on itself.`);
    }
    for (const toolId of task.toolIds) if (!allowedTools.has(toolId)) issues.push(`Task ${task.id} uses unauthorized tool ${toolId}.`);
    for (const sectionId of task.reportSectionIds) if (!sectionIds.has(sectionId)) issues.push(`Task ${task.id} references missing section ${sectionId}.`);
  }
  for (const section of plan.reportSections) {
    for (const taskId of section.sourceTaskIds) if (!taskIds.has(taskId)) issues.push(`Section ${section.id} references missing task ${taskId}.`);
  }
  if (taskIds.size === plan.tasks.length && hasDependencyCycle(plan.tasks)) issues.push("Task dependency graph contains a cycle.");
  return { valid: issues.length === 0, issues };
}
