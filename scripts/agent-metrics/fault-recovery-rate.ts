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
} from "../../src/lib/workflow/product-graph";

// 每类故障场景是一次确定性重放：注入一次故障 -> 期望 continueProductWorkflow 恢复到 completed，
// 且上游已完成节点不被重复执行。返回本次试验是否"恢复成功"。

async function providerTimeoutTrial(id: number): Promise<boolean> {
  const calls = { plan: 0, review: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; if (calls.plan === 1) throw new Error("PROVIDER_TIMEOUT"); return { planningArtifactId: `plan-${id}`, status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; return { reviewWorkflowId: `review-${id}`, status: "approved" }; },
    approve: async () => undefined,
    report: async () => { calls.report += 1; return { reportArtifactId: `report-${id}`, status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  const threadId = `timeout-${id}`;
  try {
    await startProductWorkflow({ graph, workflowId: `wf-timeout-${id}`, threadId, userId: "user-1", requirement: "provider timeout recovery" });
    return false; // 应当抛错，未抛错即视为未按预期注入故障
  } catch {
    const completed = await continueProductWorkflow({ graph, threadId }) as { finalStatus?: string };
    return completed.finalStatus === "completed" && calls.review === 1 && calls.report === 1;
  }
}

async function nodeExceptionTrial(id: number): Promise<boolean> {
  const calls = { plan: 0, review: 0, report: 0 };
  const dependencies: ProductWorkflowDependencies = {
    plan: async () => { calls.plan += 1; return { planningArtifactId: `plan-${id}`, status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; return { reviewWorkflowId: `review-${id}`, status: "approved" }; },
    approve: async () => undefined,
    report: async () => { calls.report += 1; if (calls.report === 1) throw new Error("REPORT_NODE_FAILURE"); return { reportArtifactId: `report-${id}`, status: "completed" }; },
  };
  const graph = createProductWorkflowGraph(dependencies, new MemorySaver());
  const threadId = `node-${id}`;
  try {
    await startProductWorkflow({ graph, workflowId: `wf-node-${id}`, threadId, userId: "user-1", requirement: "node exception recovery" });
    return false;
  } catch {
    const completed = await continueProductWorkflow({ graph, threadId }) as { finalStatus?: string };
    // 关键：上游 plan/review 不因晚期失败而重跑。
    return completed.finalStatus === "completed" && calls.plan === 1 && calls.review === 1 && calls.report === 2;
  }
}

async function durableCheckpointTrial(id: number): Promise<boolean> {
  const dir = mkdtempSync(path.join(tmpdir(), "agentforge-recovery-"));
  const dbPath = path.join(dir, "checkpoint.db");
  const threadId = `durable-${id}`;
  const calls = { plan: 0, review: 0, report: 0 };
  const makeDependencies = (): ProductWorkflowDependencies => ({
    plan: async () => { calls.plan += 1; return { planningArtifactId: `plan-${id}`, status: "ready", questions: [] }; },
    review: async () => { calls.review += 1; if (calls.review === 1) throw new Error("PROCESS_CRASH_DURING_REVIEW"); return { reviewWorkflowId: `review-${id}`, status: "approved" }; },
    approve: async () => undefined,
    report: async () => { calls.report += 1; return { reportArtifactId: `report-${id}`, status: "completed" }; },
  });
  const firstSaver = SqliteSaver.fromConnString(dbPath);
  const secondSaver = SqliteSaver.fromConnString(dbPath);
  try {
    const firstGraph = createProductWorkflowGraph(makeDependencies(), firstSaver);
    try {
      await startProductWorkflow({ graph: firstGraph, workflowId: `wf-durable-${id}`, threadId, userId: "user-1", requirement: "durable checkpoint recovery" });
      return false;
    } catch {
      const secondGraph = createProductWorkflowGraph(makeDependencies(), secondSaver);
      const completed = await continueProductWorkflow({ graph: secondGraph, threadId }) as { finalStatus?: string };
      // plan 崩溃前只跑过一次，重建后不重跑（durable checkpoint 生效）。
      return completed.finalStatus === "completed" && calls.plan === 1 && calls.review === 2 && calls.report === 1;
    }
  } finally {
    firstSaver.db.close();
    secondSaver.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const SCENARIOS = [
  { id: "provider-timeout", label: "Provider 超时后续跑恢复", trial: providerTimeoutTrial },
  { id: "node-exception", label: "节点异常仅重试失败节点", trial: nodeExceptionTrial },
  { id: "process-restart", label: "进程级失败后 durable checkpoint 恢复", trial: durableCheckpointTrial },
] as const;

async function main() {
  const trialsArgIndex = process.argv.indexOf("--trials");
  const trials = trialsArgIndex === -1 ? 10 : Math.max(1, Number(process.argv[trialsArgIndex + 1]) || 10);

  const scenarioResults = [];
  let totalRuns = 0;
  let totalRecovered = 0;

  for (const scenario of SCENARIOS) {
    let recovered = 0;
    for (let i = 0; i < trials; i += 1) {
      const ok = await scenario.trial(i);
      if (ok) recovered += 1;
    }
    totalRuns += trials;
    totalRecovered += recovered;
    scenarioResults.push({ scenario: scenario.id, label: scenario.label, trials, recovered, recoveryRate: recovered / trials });
  }

  console.log(JSON.stringify({
    metric: "fault-recovery-rate",
    scenarioCount: SCENARIOS.length,
    trialsPerScenario: trials,
    totalRuns,
    totalRecovered,
    overallRecoveryRate: totalRuns === 0 ? null : totalRecovered / totalRuns,
    scenarios: scenarioResults,
    limitation: "These are deterministic fault replays: each scenario injects one fault and asserts continueProductWorkflow recovers to completed without repeating completed upstream nodes. The rate measures recovery-mechanism correctness under injected faults, not chaotic random-timing crash testing.",
  }, null, 2));

  if (totalRecovered !== totalRuns) {
    console.error(`Fault recovery gate failed: ${totalRecovered}/${totalRuns} trials recovered.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
