import assert from "node:assert/strict";
import test from "node:test";
import { runWithLeaseRenewal } from "./lease-renewal";

test("租约续期被 fencing 拒绝后，工作流包装器不会把已完成结果误报为成功", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let renewal: (() => void) | undefined;

  try {
    // 将 10 分钟定时器替换为可控回调，仅验证续租失败后的调用方语义。
    global.setInterval = ((callback: () => void) => {
      renewal = callback;
      return { unref: () => undefined } as unknown as NodeJS.Timeout;
    }) as typeof setInterval;
    global.clearInterval = (() => undefined) as typeof clearInterval;

    const result = runWithLeaseRenewal({
      workflowId: "workflow-fenced",
      lease: { ownerId: "instance-a", token: 1 },
      renew: async () => false,
      renewalIntervalMs: 10 * 60 * 1_000,
      run: async () => {
        renewal?.();
        await new Promise((resolve) => setImmediate(resolve));
        return "must-not-be-returned";
      },
    });

    await assert.rejects(result, /WORKFLOW_LEASE_FENCED/);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("工作流先结束时仍会等待进行中的续租结果", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let renewal: (() => void) | undefined;
  let finishRenewal: ((value: boolean) => void) | undefined;

  try {
    global.setInterval = ((callback: () => void) => {
      renewal = callback;
      return { unref: () => undefined } as unknown as NodeJS.Timeout;
    }) as typeof setInterval;
    global.clearInterval = (() => undefined) as typeof clearInterval;

    const result = runWithLeaseRenewal({
      workflowId: "workflow-in-flight-renewal",
      lease: { ownerId: "instance-a", token: 1 },
      renew: () => new Promise<boolean>((resolve) => { finishRenewal = resolve; }),
      renewalIntervalMs: 10 * 60 * 1_000,
      run: async () => {
        renewal?.();
        return "must-not-be-returned";
      },
    });

    // 主体已返回但续租尚未完成，因此 Promise 不应提前完成。
    let settled = false;
    // 使用双分支观察结算状态，避免 finally 派生出的拒绝 Promise 未被处理。
    void result.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    finishRenewal?.(false);
    await assert.rejects(result, /WORKFLOW_LEASE_FENCED/);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});
