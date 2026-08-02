import type { WorkflowLease } from "./workflow-lease";

/**
 * 租约操作只依赖 Prisma delegate 的最小接口，避免测试进程复制生产 SQL。
 * 应用服务和跨进程集成测试都必须调用本模块，保证 fencing 谓词不会漂移。
 */
type DevelopmentWorkflowDelegate = {
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

/** 当前持有者续租时，owner、token 和未过期状态必须同时匹配。 */
export async function renewActiveWorkflowLease(input: {
  workflows: DevelopmentWorkflowDelegate;
  workflowId: string;
  lease: Pick<WorkflowLease, "ownerId" | "token">;
  now: Date;
  durationMs: number;
}) {
  return input.workflows.updateMany({
    where: {
      id: input.workflowId,
      leaseOwnerId: input.lease.ownerId,
      leaseToken: input.lease.token,
      leaseExpiresAt: { gt: input.now },
    },
    data: { leaseExpiresAt: new Date(input.now.getTime() + input.durationMs) },
  });
}

/**
 * 仅允许已经过期的 running 工作流被新实例接管。
 * version 与旧 token 同时参与条件更新，旧实例不能覆盖接管后的状态。
 */
export async function claimExpiredWorkflowLease(input: {
  workflows: DevelopmentWorkflowDelegate;
  workflowId: string;
  userId: string;
  expectedVersion: number;
  expectedLeaseToken: number;
  lease: WorkflowLease;
  now: Date;
}) {
  return input.workflows.updateMany({
    where: {
      id: input.workflowId,
      userId: input.userId,
      status: "running",
      version: input.expectedVersion,
      leaseToken: input.expectedLeaseToken,
      leaseExpiresAt: { lte: input.now },
    },
    data: {
      status: "running",
      lastErrorCode: null,
      leaseExpiresAt: input.lease.expiresAt,
      leaseOwnerId: input.lease.ownerId,
      leaseToken: input.lease.token,
      finishedAt: null,
      version: { increment: 1 },
    },
  });
}

/** 所有最终状态写入都必须携带当前 owner 与 token，形成 fencing 边界。 */
export async function writeFencedWorkflowState(input: {
  workflows: DevelopmentWorkflowDelegate;
  workflowId: string;
  lease: Pick<WorkflowLease, "ownerId" | "token">;
  data: Record<string, unknown>;
}) {
  return input.workflows.updateMany({
    where: {
      id: input.workflowId,
      leaseOwnerId: input.lease.ownerId,
      leaseToken: input.lease.token,
    },
    data: input.data,
  });
}
