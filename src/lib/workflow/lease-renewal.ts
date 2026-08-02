import type { WorkflowLease } from "./workflow-lease";

/**
 * 在工作流执行期间定期续租；一旦续租失败，当前实例不得再把结果写成成功。
 * 调用方负责提供实际的持久化续租操作，使本模块保持无数据库、无框架依赖。
 */
export async function runWithLeaseRenewal<T>(input: {
  workflowId: string;
  lease: Pick<WorkflowLease, "ownerId" | "token">;
  run: () => Promise<T>;
  renew: () => Promise<boolean>;
  renewalIntervalMs: number;
}) {
  let renewalInFlight = false;
  let renewalPromise: Promise<void> | null = null;
  let leaseLost = false;
  const timer = setInterval(() => {
    if (renewalInFlight || leaseLost) return;
    renewalInFlight = true;
    // 保留本次续租的 Promise。工作流主体结束时必须等待它结算，
    // 否则可能在续租被拒绝前把结果误报为成功。
    renewalPromise = input.renew()
      .then((renewed) => { leaseLost = !renewed; })
      .catch(() => { leaseLost = true; })
      .finally(() => { renewalInFlight = false; });
  }, input.renewalIntervalMs);
  timer.unref();

  try {
    const result = await input.run();
    // 停止新的续租后，等待已经开始的最后一次续租完成，封住主体结束瞬间的竞态窗口。
    clearInterval(timer);
    await renewalPromise;
    if (leaseLost) throw new Error("WORKFLOW_LEASE_FENCED");
    return result;
  } finally {
    clearInterval(timer);
  }
}
