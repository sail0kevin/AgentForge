import { z } from "zod";
import { IncrementalApprovalPatchSchema } from "@/lib/planner/incremental-approval";

export const WorkflowNodeKeySchema = z.enum([
  "analyze_requirement",
  "create_plan",
  "clarification",
  "cross_review",
  "human_approval",
  "generate_report",
  "finalize",
]);

export const WorkflowStatusSchema = z.enum([
  "pending",
  "running",
  "needs_clarification",
  "needs_human",
  "completed",
  "partial",
  "blocked",
  "inconclusive",
  "failed",
]);

export const WorkflowNodeStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "completed",
  "partial",
  "blocked",
  "skipped",
  "failed",
]);

export const WorkflowModeSchema = z.enum(["baseline", "model"]);

export const WorkflowAgentConfigSchema = z.object({
  plannerAgentId: z.string().min(1).optional(),
  candidateAgentIds: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
  reviewerAgentId: z.string().min(1).optional(),
  evaluatorAgentId: z.string().min(1).optional(),
  reporterAgentId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  const reviewIds = [value.candidateAgentIds, value.reviewerAgentId, value.evaluatorAgentId];
  const populated = reviewIds.filter(Boolean).length;
  if (populated !== 0 && populated !== reviewIds.length) {
    context.addIssue({ code: "custom", message: "Model review requires two candidate Agents, one Reviewer, and one Evaluator." });
  }
});

export const CreateDevelopmentWorkflowSchema = z.object({
  requirement: z.string().trim().min(20).max(20_000),
  mode: WorkflowModeSchema.default("baseline"),
  agents: WorkflowAgentConfigSchema.default({}),
}).superRefine((value, context) => {
  if (value.mode !== "model") return;
  const requiredRoles: Array<[keyof z.infer<typeof WorkflowAgentConfigSchema>, string]> = [
    ["plannerAgentId", "Planner Agent"],
    ["candidateAgentIds", "two Candidate Agents"],
    ["reviewerAgentId", "Reviewer Agent"],
    ["evaluatorAgentId", "Evaluator Agent"],
    ["reporterAgentId", "Reporter Agent"],
  ];
  for (const [key, label] of requiredRoles) {
    if (!value.agents[key]) {
      context.addIssue({ code: "custom", path: ["agents", key], message: `Model workflow requires ${label}.` });
    }
  }
});

export const ClarificationResumeSchema = z.object({
  kind: z.literal("clarification"),
  answer: z.string().trim().min(1).max(10_000),
});

export const ApprovalResumeSchema = z.object({
  kind: z.literal("approval"),
  decision: z.enum(["delivery", "quality", "hybrid", "reject"]),
  note: z.string().trim().max(2_000).optional(),
  // 人工只可提交已有任务的受控字段补丁，服务端会基于原计划重新执行完整校验。
  taskPatch: IncrementalApprovalPatchSchema.optional(),
}).superRefine((value, context) => {
  if (value.decision === "reject" && value.taskPatch) {
    context.addIssue({ code: "custom", path: ["taskPatch"], message: "拒绝当前候选时不能同时提交任务修改。" });
  }
});

export const WorkflowResumeSchema = z.discriminatedUnion("kind", [ClarificationResumeSchema, ApprovalResumeSchema]);

export type WorkflowNodeKey = z.infer<typeof WorkflowNodeKeySchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type WorkflowNodeStatus = z.infer<typeof WorkflowNodeStatusSchema>;
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;
export type WorkflowAgentConfig = z.infer<typeof WorkflowAgentConfigSchema>;
export type WorkflowResume = z.infer<typeof WorkflowResumeSchema>;

export const WORKFLOW_NODES: ReadonlyArray<{ key: WorkflowNodeKey; label: string; sortOrder: number }> = [
  { key: "analyze_requirement", label: "需求分析", sortOrder: 0 },
  { key: "create_plan", label: "计划与动态目录", sortOrder: 1 },
  { key: "clarification", label: "补充信息", sortOrder: 2 },
  { key: "cross_review", label: "候选方案与交叉评审", sortOrder: 3 },
  { key: "human_approval", label: "人工确认", sortOrder: 4 },
  { key: "generate_report", label: "动态报告", sortOrder: 5 },
  { key: "finalize", label: "完成与归档", sortOrder: 6 },
];
