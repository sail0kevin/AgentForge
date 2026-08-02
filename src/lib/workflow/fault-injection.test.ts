import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  continueProductWorkflow,
  createProductWorkflowGraph,
  startProductWorkflow,
  type ProductWorkflowDependencies,
} from "./product-graph";

// 故障注入场景一：Provider 超时。
// 第一次 plan 调用模拟 Provider 超时抛错，工作流在最早的节点崩溃；
// 修复（超时消失）后用 continueProductWorkflow 从 durable checkpoint 续跑并完成。
test("fault injection: a provider timeout at the plan node recovers on continue", async () => {
  const calls = { plan: 0, review: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => {
      calls.plan += 1;
      if (calls.plan === 1) throw new Error("PROVIDER_TIMEOUT");
      return { planningArtifactId: "plan-timeout", status: "ready", questions: [] };
    },
    review: async () => { calls.review += 1; return { reviewWorkflowId: "review-timeout", status: "approved" }; },
    approve: async () => undefined,
    report: async () => { calls.report += 1; return { reportArtifactId: "report-timeout", status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());

  await assert.rejects(
    startProductWorkflow({ graph, workflowId: "wf-timeout", threadId: "thread-timeout", userId: "user-1", requirement: "Recover from a provider timeout during planning." }),
    /PROVIDER_TIMEOUT/,
  );

  const completed = await continueProductWorkflow({ graph, threadId: "thread-timeout" });
  assert.equal(completed.finalStatus, "completed");
  // plan 在最早节点失败，续跑时重跑 plan（无更早 checkpoint 可跳过）；review/report 各一次。
  assert.deepEqual(calls, { plan: 2, review: 1, report: 1 });
});

// 故障注入场景二：节点异常（晚期节点 generate_report 抛错）。
// 验证续跑只重试失败的节点，不重复已完成的上游工作（plan/review 各仍为 1 次）。
test("fault injection: a node exception at report retries only the failed node", async () => {
  const calls = { plan: 0, review: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; return { planningArtifactId: "plan-node", status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; return { reviewWorkflowId: "review-node", status: "approved" }; },
    approve: async () => undefined,
    report: async () => {
      calls.report += 1;
      if (calls.report === 1) throw new Error("REPORT_NODE_FAILURE");
      return { reportArtifactId: "report-node", status: "completed" };
    },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());

  await assert.rejects(
    startProductWorkflow({ graph, workflowId: "wf-node", threadId: "thread-node", userId: "user-1", requirement: "Recover from a late-stage report node exception." }),
    /REPORT_NODE_FAILURE/,
  );

  const completed = await continueProductWorkflow({ graph, threadId: "thread-node" });
  assert.equal(completed.finalStatus, "completed");
  // 关键断言：上游 plan/review 不因晚期失败而重跑，只有 report 重试。
  assert.deepEqual(calls, { plan: 1, review: 1, report: 2 });
});

// 故障注入场景三：进程级失败后的 durable checkpoint 恢复。
// 用真实磁盘 SqliteSaver 落盘；第一个图实例在 review 处崩溃后，
// 用一个全新的 saver 连接 + 全新图实例读取同一个 db 文件续跑，
// 证明 durable checkpoint 能跨图实例/进程重建存活。
test("fault injection: durable sqlite checkpoint survives a fresh saver and graph rebuild", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agentforge-fault-"));
  const dbPath = path.join(dir, "checkpoint.db");
  const threadId = "thread-durable";
  const calls = { plan: 0, review: 0, report: 0 };

  const makeDependencies = (): ProductWorkflowDependencies => ({
    plan: async () => { calls.plan += 1; return { planningArtifactId: "plan-durable", status: "ready", questions: [] }; },
    review: async () => {
      calls.review += 1;
      if (calls.review === 1) throw new Error("PROCESS_CRASH_DURING_REVIEW");
      return { reviewWorkflowId: "review-durable", status: "approved" };
    },
    approve: async () => undefined,
    report: async () => { calls.report += 1; return { reportArtifactId: "report-durable", status: "completed" }; },
  });

  // 第一次运行：真实磁盘 saver，review 抛错模拟进程崩溃前的最后状态。
  const firstSaver = SqliteSaver.fromConnString(dbPath);
  const secondSaver = SqliteSaver.fromConnString(dbPath);
  try {
    const firstGraph = createProductWorkflowGraph(makeDependencies(), firstSaver);
    await assert.rejects(
      startProductWorkflow({ graph: firstGraph, workflowId: "wf-durable", threadId, userId: "user-1", requirement: "Persist a durable checkpoint before a simulated process crash." }),
      /PROCESS_CRASH_DURING_REVIEW/,
    );

    // 模拟进程重启：全新 saver 连接 + 全新图实例，只共享磁盘上的 checkpoint 文件。
    const secondGraph = createProductWorkflowGraph(makeDependencies(), secondSaver);
    const completed = await continueProductWorkflow({ graph: secondGraph, threadId });

    assert.equal(completed.finalStatus, "completed");
    // plan 只在崩溃前跑过一次，重建后不重跑（durable checkpoint 生效）；review 重试一次成功。
    assert.deepEqual(calls, { plan: 1, review: 2, report: 1 });
  } finally {
    // Windows 下需先关闭 better-sqlite3 句柄，否则临时文件仍被占用无法删除。
    firstSaver.db.close();
    secondSaver.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
