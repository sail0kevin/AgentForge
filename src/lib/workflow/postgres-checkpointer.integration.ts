import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  continueProductWorkflow,
  createProductWorkflowGraph,
  startProductWorkflow,
  type ProductWorkflowDependencies,
} from "./product-graph";

// 只接受显式的集成测试连接串，避免测试误写入开发或生产数据库。
const postgresTestUrl = process.env.AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL;

test(
  "integration: postgres checkpoint survives a fresh saver and graph rebuild",
  { skip: postgresTestUrl ? false : "PostgreSQL integration test skipped: AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL is not set" },
  async () => {
    const threadId = `postgres-checkpoint-${randomUUID()}`;
    const calls = { plan: 0, review: 0, report: 0 };
    const makeDependencies = (): ProductWorkflowDependencies => ({
      plan: async () => {
        calls.plan += 1;
        return { planningArtifactId: "plan-postgres", status: "ready", questions: [] };
      },
      review: async () => {
        calls.review += 1;
        if (calls.review === 1) throw new Error("PROCESS_CRASH_DURING_REVIEW");
        return { reviewWorkflowId: "review-postgres", status: "approved" };
      },
      approve: async () => undefined,
      report: async () => {
        calls.report += 1;
        return { reportArtifactId: "report-postgres", status: "completed" };
      },
    });

    // 两个 Saver 和 Graph 都独立创建，模拟两个应用实例只通过 PostgreSQL 共享状态。
    const firstSaver = PostgresSaver.fromConnString(postgresTestUrl!);
    const secondSaver = PostgresSaver.fromConnString(postgresTestUrl!);
    try {
      const firstGraph = createProductWorkflowGraph(makeDependencies(), firstSaver);
      await assert.rejects(
        startProductWorkflow({
          graph: firstGraph,
          workflowId: `wf-${threadId}`,
          threadId,
          userId: "integration-test-user",
          requirement: "Persist a PostgreSQL checkpoint before a simulated process crash.",
        }),
        /PROCESS_CRASH_DURING_REVIEW/,
      );

      // 实例 A 在 review 崩溃后，实例 B 从同一 thread 的最新 checkpoint 继续执行。
      const secondGraph = createProductWorkflowGraph(makeDependencies(), secondSaver);
      const completed = await continueProductWorkflow({ graph: secondGraph, threadId });

      assert.equal(completed.finalStatus, "completed");
      assert.deepEqual(calls, { plan: 1, review: 2, report: 1 });
    } finally {
      // 清理本测试唯一创建的 thread，并主动关闭连接池，避免测试进程残留连接。
      await firstSaver.deleteThread(threadId).catch(() => undefined);
      await Promise.all([firstSaver.end(), secondSaver.end()]);
    }
  },
);
