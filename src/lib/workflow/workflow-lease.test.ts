import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentLease, nextLease, renewLease } from "./workflow-lease";

test("过期租约可由新实例接管，并分配单调递增的 fencing token", () => {
  const now = new Date("2026-07-30T00:00:00.000Z");
  const lease = nextLease({
    record: { leaseOwnerId: "instance-a", leaseToken: 7, leaseExpiresAt: new Date("2026-07-29T23:59:59.999Z") },
    ownerId: "instance-b",
    now,
    durationMs: 30_000,
  });

  assert.deepEqual(lease, { ownerId: "instance-b", token: 8, expiresAt: new Date("2026-07-30T00:00:30.000Z") });
});

test("未过期租约不能被第二个实例抢占", () => {
  const lease = nextLease({
    record: { leaseOwnerId: "instance-a", leaseToken: 7, leaseExpiresAt: new Date("2026-07-30T00:00:01.000Z") },
    ownerId: "instance-b",
    now: new Date("2026-07-30T00:00:00.000Z"),
    durationMs: 30_000,
  });

  assert.equal(lease, null);
});

test("续租必须匹配持有者与 token，旧持有者不能续租或通过 fencing 写入", () => {
  const record = { leaseOwnerId: "instance-b", leaseToken: 8, leaseExpiresAt: new Date("2026-07-30T00:00:10.000Z") };
  const now = new Date("2026-07-30T00:00:00.000Z");

  assert.equal(renewLease({ record, lease: { ownerId: "instance-a", token: 7 }, now, durationMs: 30_000 }), null);
  assert.equal(isCurrentLease(record, { ownerId: "instance-a", token: 7 }), false);
  assert.equal(isCurrentLease(record, { ownerId: "instance-b", token: 8 }), true);
});

test("当前持有者在租约到期前续租时保留 fencing token", () => {
  const renewed = renewLease({
    record: { leaseOwnerId: "instance-b", leaseToken: 8, leaseExpiresAt: new Date("2026-07-30T00:00:10.000Z") },
    lease: { ownerId: "instance-b", token: 8 },
    now: new Date("2026-07-30T00:00:00.000Z"),
    durationMs: 30_000,
  });

  assert.deepEqual(renewed, { ownerId: "instance-b", token: 8, expiresAt: new Date("2026-07-30T00:00:30.000Z") });
});
