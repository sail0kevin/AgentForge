import assert from "node:assert/strict";
import test from "node:test";
import { claimExpiredWorkflowLease, renewActiveWorkflowLease, writeFencedWorkflowState } from "./workflow-lease-store";

function createDelegate() {
  const calls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  return {
    calls,
    updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      calls.push(input);
      return { count: 1 };
    },
  };
}

test("共享租约存储操作保留续租、过期接管和 fencing 的完整条件", async () => {
  const workflows = createDelegate();
  const now = new Date("2026-07-31T00:00:00.000Z");

  await renewActiveWorkflowLease({
    workflows,
    workflowId: "workflow-1",
    lease: { ownerId: "instance-a", token: 4 },
    now,
    durationMs: 60_000,
  });
  await claimExpiredWorkflowLease({
    workflows,
    workflowId: "workflow-1",
    userId: "user-1",
    expectedVersion: 8,
    expectedLeaseToken: 4,
    lease: { ownerId: "instance-b", token: 5, expiresAt: new Date("2026-07-31T00:30:00.000Z") },
    now,
  });
  await writeFencedWorkflowState({
    workflows,
    workflowId: "workflow-1",
    lease: { ownerId: "instance-b", token: 5 },
    data: { status: "completed" },
  });

  // 续租必须同时验证所有权、token 和未过期状态。
  assert.deepEqual(workflows.calls[0].where, {
    id: "workflow-1",
    leaseOwnerId: "instance-a",
    leaseToken: 4,
    leaseExpiresAt: { gt: now },
  });
  // 接管只允许 running 状态的过期租约，并同时比较版本与旧 token。
  assert.deepEqual(workflows.calls[1].where, {
    id: "workflow-1",
    userId: "user-1",
    status: "running",
    version: 8,
    leaseToken: 4,
    leaseExpiresAt: { lte: now },
  });
  assert.deepEqual(workflows.calls[2].where, {
    id: "workflow-1",
    leaseOwnerId: "instance-b",
    leaseToken: 5,
  });
});

test("fenced 写入返回零行时保留租约丢失信号", async () => {
  const workflows = createDelegate();
  workflows.updateMany = async (input) => {
    workflows.calls.push(input);
    return { count: 0 };
  };

  const result = await writeFencedWorkflowState({
    workflows,
    workflowId: "workflow-stale",
    lease: { ownerId: "instance-old", token: 3 },
    data: { status: "failed" },
  });

  assert.equal(result.count, 0);
  assert.equal(workflows.calls.length, 1);
});
