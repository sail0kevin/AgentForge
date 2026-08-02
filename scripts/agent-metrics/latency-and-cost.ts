import { prisma } from "../../src/lib/db";

async function main() {
  const nodes = await prisma.workflowNode.findMany({
    where: { startedAt: { not: null }, finishedAt: { not: null } },
    select: { nodeKey: true, startedAt: true, finishedAt: true },
  });

  const byNodeKey = new Map<string, { count: number; totalMs: number }>();
  for (const node of nodes) {
    if (!node.startedAt || !node.finishedAt) continue;
    const durationMs = node.finishedAt.getTime() - node.startedAt.getTime();
    const bucket = byNodeKey.get(node.nodeKey) ?? { count: 0, totalMs: 0 };
    bucket.count += 1;
    bucket.totalMs += durationMs;
    byNodeKey.set(node.nodeKey, bucket);
  }

  const nodeLatency = Array.from(byNodeKey.entries()).map(([nodeKey, bucket]) => ({
    nodeKey,
    sampleSize: bucket.count,
    averageMs: bucket.count === 0 ? null : bucket.totalMs / bucket.count,
  }));
  nodeLatency.sort((a, b) => (b.averageMs ?? 0) - (a.averageMs ?? 0));

  const tokenUsages = await prisma.tokenUsage.findMany({
    where: { runId: { not: null } },
    select: { runId: true, inputTokens: true, outputTokens: true, costUsd: true, costCny: true },
  });

  const byRunId = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; costCny: number }>();
  for (const usage of tokenUsages) {
    if (!usage.runId) continue;
    const bucket = byRunId.get(usage.runId) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0 };
    bucket.inputTokens += usage.inputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.costUsd += usage.costUsd;
    bucket.costCny += usage.costCny;
    byRunId.set(usage.runId, bucket);
  }

  const runTotals = Array.from(byRunId.values());
  const totalRuns = runTotals.length;

  console.log(JSON.stringify({
    metric: "latency-and-cost",
    nodeLatency,
    bottleneckNodeKey: nodeLatency[0]?.nodeKey ?? null,
    tokenUsage: {
      sampleSize: totalRuns,
      averageInputTokensPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.inputTokens, 0) / totalRuns,
      averageOutputTokensPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.outputTokens, 0) / totalRuns,
      averageCostUsdPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.costUsd, 0) / totalRuns,
    },
    limitation: nodes.length === 0 ? "No completed WorkflowNode rows found; run the workflow before trusting this output." : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
