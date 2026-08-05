import { prisma } from "../../src/lib/db";
import { type DataSource, type MetricComputeOutput, computeValidity } from "./lib/metric-types";

export interface WorkflowNodeRow {
  nodeKey: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface TokenUsageRow {
  runId: string | null;
  inputTokens: number;
  outputTokens: number;
  tokenSource: string;
  costUsd: number;
  costCny: number;
}

export interface LatencyInput {
  nodes: WorkflowNodeRow[];
  tokenUsages: TokenUsageRow[];
}

export interface NodeLatency {
  nodeKey: string;
  sampleSize: number;
  averageMs: number | null;
}

export interface LatencyCostData {
  nodeLatency: NodeLatency[];
  bottleneckNodeKey: string | null;
  bottleneckReason: string | null;
  tokenUsage: {
    sampleSize: number;
    averageInputTokensPerRun: number | null;
    averageOutputTokensPerRun: number | null;
    averageCostUsdPerRun: number | null;
    providerTokenRuns: number;
    estimatedTokenRuns: number;
  };
}

/**
 * 纯计算函数：从 WorkflowNode 和 TokenUsage 记录计算延迟与成本指标。不访问 DB。
 *
 * 关键修正：当所有节点 averageMs 相等（含全 0）时，排序比较器对所有 pair 返回 0，
 * 导致 bottleneckNodeKey 退化为 Map 插入顺序首项。本函数检测此退化并返回 null。
 */
export function computeLatencyAndCost(input: LatencyInput, dataSource: DataSource): MetricComputeOutput<LatencyCostData> {
  const { nodes, tokenUsages } = input;

  const byNodeKey = new Map<string, { count: number; totalMs: number }>();
  for (const node of nodes) {
    if (!node.startedAt || !node.finishedAt) continue;
    const durationMs = node.finishedAt.getTime() - node.startedAt.getTime();
    const bucket = byNodeKey.get(node.nodeKey) ?? { count: 0, totalMs: 0 };
    bucket.count += 1;
    bucket.totalMs += durationMs;
    byNodeKey.set(node.nodeKey, bucket);
  }

  const nodeLatency: NodeLatency[] = Array.from(byNodeKey.entries()).map(([nodeKey, bucket]) => ({
    nodeKey,
    sampleSize: bucket.count,
    averageMs: bucket.count === 0 ? null : bucket.totalMs / bucket.count,
  }));

  // 退化检测：所有 averageMs 相等时排序不可信。
  const definedAverages = nodeLatency.map((n) => n.averageMs).filter((v): v is number => v !== null);
  const allEqual = definedAverages.length > 0 && definedAverages.every((v) => v === definedAverages[0]);

  let bottleneckNodeKey: string | null = null;
  let bottleneckReason: string | null = null;

  if (nodeLatency.length === 0) {
    bottleneckReason = "No completed WorkflowNode rows found.";
  } else if (allEqual) {
    bottleneckReason = `All ${nodeLatency.length} node(s) have identical averageMs (${definedAverages[0] ?? "null"}); bottleneck detection is degenerate and suppressed.`;
  } else {
    const sorted = [...nodeLatency].sort((a, b) => (b.averageMs ?? 0) - (a.averageMs ?? 0));
    bottleneckNodeKey = sorted[0]?.nodeKey ?? null;
  }

  const byRunId = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; costCny: number }>();
  let providerTokenRuns = 0;
  let estimatedTokenRuns = 0;
  for (const usage of tokenUsages) {
    if (!usage.runId) continue;
    const bucket = byRunId.get(usage.runId) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0 };
    bucket.inputTokens += usage.inputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.costUsd += usage.costUsd;
    bucket.costCny += usage.costCny;
    byRunId.set(usage.runId, bucket);
    if (usage.tokenSource === "provider") providerTokenRuns += 1;
    else estimatedTokenRuns += 1;
  }

  const runTotals = Array.from(byRunId.values());
  const totalRuns = runTotals.length;

  const hasDegenerate = allEqual && nodeLatency.length > 0;
  const validity = computeValidity({ hasDegenerate, sampleSize: Math.max(nodes.length, totalRuns), dataSource });

  return {
    metric: "latency-and-cost",
    validity,
    data: {
      nodeLatency,
      bottleneckNodeKey,
      bottleneckReason,
      tokenUsage: {
        sampleSize: totalRuns,
        averageInputTokensPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.inputTokens, 0) / totalRuns,
        averageOutputTokensPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.outputTokens, 0) / totalRuns,
        averageCostUsdPerRun: totalRuns === 0 ? null : runTotals.reduce((sum, r) => sum + r.costUsd, 0) / totalRuns,
        providerTokenRuns,
        estimatedTokenRuns,
      },
    },
    limitation: nodes.length === 0 ? "No completed WorkflowNode rows found; run the workflow before trusting this output." : bottleneckReason ?? undefined,
  };
}

async function main() {
  const dataSource = parseDataSourceCli();
  const [nodes, tokenUsages] = await Promise.all([
    prisma.workflowNode.findMany({
      where: { startedAt: { not: null }, finishedAt: { not: null } },
      select: { nodeKey: true, startedAt: true, finishedAt: true },
    }),
    prisma.tokenUsage.findMany({
      where: { runId: { not: null } },
      select: { runId: true, inputTokens: true, outputTokens: true, tokenSource: true, costUsd: true, costCny: true },
    }),
  ]);
  const result = computeLatencyAndCost({ nodes, tokenUsages }, dataSource);
  console.log(JSON.stringify({ ...result, ok: true }, null, 2));
}

function parseDataSourceCli(): DataSource {
  const idx = process.argv.indexOf("--data-source");
  const valid: DataSource[] = ["stub", "real-model", "mixed", "unknown"];
  const raw = idx === -1 ? undefined : process.argv[idx + 1];
  return valid.includes(raw as DataSource) ? (raw as DataSource) : "unknown";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
