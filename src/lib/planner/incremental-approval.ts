import { createHash } from "node:crypto";
import { z } from "zod";
import { AgentRoleSchema, ExecutionPlanSchema, type ExecutionPlan } from "./contracts";
import { DEFAULT_PLANNER_BUDGET } from "./planner-service";
import { validateExecutionPlan } from "./validation";

const TaskAmendmentSchema = z.object({
  taskId: z.string().min(1).max(80),
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().min(10).max(1_000).optional(),
  agentRole: AgentRoleSchema.optional(),
  dependsOn: z.array(z.string().min(1).max(80)).max(20).optional(),
  toolIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  estimatedTokens: z.number().int().positive().max(100_000).optional(),
}).superRefine((value, context) => {
  if (Object.keys(value).some((key) => key !== "taskId")) return;
  context.addIssue({ code: "custom", message: "每项任务修改至少需要提供一个可编辑字段。" });
});

export const IncrementalApprovalPatchSchema = z.object({
  schemaVersion: z.literal(1),
  taskEdits: z.array(TaskAmendmentSchema).min(1).max(12),
}).superRefine((value, context) => {
  const ids = value.taskEdits.map((item) => item.taskId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["taskEdits"], message: "同一任务只能修改一次。" });
});

export type IncrementalApprovalPatch = z.infer<typeof IncrementalApprovalPatchSchema>;

function stablePlanFingerprint(plan: ExecutionPlan) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

/**
 * 审批补丁只覆盖已有任务的受控执行字段，不允许增删任务或改写报告章节。
 * token 变化会按原计划比例重估成本，最终仍由完整 Planner 语义校验决定是否可接受。
 */
export function applyIncrementalApprovalPatch(planInput: unknown, patchInput: unknown) {
  const original = ExecutionPlanSchema.parse(planInput);
  const patch = IncrementalApprovalPatchSchema.parse(patchInput);
  const edits = new Map(patch.taskEdits.map((edit) => [edit.taskId, edit]));
  for (const taskId of edits.keys()) if (!original.tasks.some((task) => task.id === taskId)) throw new Error("APPROVAL_PATCH_TASK_NOT_FOUND");

  const tasks = original.tasks.map((task) => {
    const edit = edits.get(task.id);
    if (!edit) return task;
    return {
      ...task,
      ...(edit.title === undefined ? {} : { title: edit.title }),
      ...(edit.description === undefined ? {} : { description: edit.description }),
      ...(edit.agentRole === undefined ? {} : { agentRole: edit.agentRole }),
      ...(edit.dependsOn === undefined ? {} : { dependsOn: edit.dependsOn }),
      ...(edit.toolIds === undefined ? {} : { toolIds: edit.toolIds }),
      ...(edit.estimatedTokens === undefined ? {} : { estimatedTokens: edit.estimatedTokens }),
    };
  });
  const estimatedTotalTokens = tasks.reduce((sum, task) => sum + task.estimatedTokens, 0);
  // 成本属于 Planner 的预估值；在没有真实 Provider 账单前仅按原计划比例变化，不伪造实际费用。
  const estimatedCostUsd = Number((original.estimatedCostUsd * estimatedTotalTokens / original.estimatedTotalTokens).toFixed(6));
  const plan = ExecutionPlanSchema.parse({ ...original, tasks, estimatedTotalTokens, estimatedCostUsd });
  const validation = validateExecutionPlan(plan, DEFAULT_PLANNER_BUDGET);
  if (!validation.valid) throw new Error(`APPROVAL_PATCH_PLAN_INVALID: ${validation.issues.join(" | ")}`);
  return { plan, patch, originalPlanSha256: stablePlanFingerprint(original), amendedPlanSha256: stablePlanFingerprint(plan) };
}
