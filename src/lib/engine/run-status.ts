import type { WorkspaceStatus } from "@/lib/types";

type ResolveRunCompletionStatusInput = {
  budgetStatus: WorkspaceStatus;
  hadAgentFailure: boolean;
};

/**
 * 聚合整轮运行的唯一完成状态。
 *
 * 优先级固定为：预算耗尽 > Agent 失败或预算警告 > 正常完成。
 * 运行中的临时状态不能作为 run_completed 的最终状态发出。
 */
export function resolveRunCompletionStatus({
  budgetStatus,
  hadAgentFailure,
}: ResolveRunCompletionStatusInput): Exclude<WorkspaceStatus, "running"> {
  if (budgetStatus === "exhausted") return "exhausted";
  if (hadAgentFailure || budgetStatus === "warning") return "warning";
  return "idle";
}
