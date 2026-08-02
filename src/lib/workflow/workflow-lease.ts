export type WorkflowLease = {
  ownerId: string;
  token: number;
  expiresAt: Date;
};

type LeaseRecord = {
  leaseOwnerId: string | null;
  leaseToken: number;
  leaseExpiresAt: Date | null;
};

/** 判断租约是否仍由某个实例有效持有。 */
export function hasActiveLease(record: LeaseRecord, now: Date) {
  return Boolean(record.leaseOwnerId && record.leaseExpiresAt && record.leaseExpiresAt > now);
}

/**
 * 为无租约或已过期的工作流生成下一代租约。
 * token 只会递增，旧实例即使稍后恢复也无法伪装为当前持有者。
 */
export function nextLease(input: {
  record: LeaseRecord;
  ownerId: string;
  now: Date;
  durationMs: number;
}): WorkflowLease | null {
  if (hasActiveLease(input.record, input.now)) return null;
  return {
    ownerId: input.ownerId,
    token: input.record.leaseToken + 1,
    expiresAt: new Date(input.now.getTime() + input.durationMs),
  };
}

/** 当前持有者续租时保留 token；所有权变化才会分配新 token。 */
export function renewLease(input: {
  record: LeaseRecord;
  lease: Pick<WorkflowLease, "ownerId" | "token">;
  now: Date;
  durationMs: number;
}): WorkflowLease | null {
  if (
    input.record.leaseOwnerId !== input.lease.ownerId
    || input.record.leaseToken !== input.lease.token
    || !input.record.leaseExpiresAt
    || input.record.leaseExpiresAt <= input.now
  ) return null;
  return { ...input.lease, expiresAt: new Date(input.now.getTime() + input.durationMs) };
}

/** 供状态写入使用的 fencing 校验，不能仅依赖过期时间或乐观 version。 */
export function isCurrentLease(record: LeaseRecord, lease: Pick<WorkflowLease, "ownerId" | "token">) {
  return record.leaseOwnerId === lease.ownerId && record.leaseToken === lease.token;
}
