import { prisma } from "../../src/lib/db";
import { type DataSource, type MetricComputeOutput, computeValidity } from "./lib/metric-types";

/** 单条 ToolInvocation 记录的最小字段集。 */
export interface ToolInvocationRow {
  status: string;
  errorCode: string | null;
  replayed: boolean;
  toolId: string;
}

export interface ToolReliabilityData {
  sampleSize: number;
  successRate: number | null;
  failureRate: number | null;
  replayHitRate: number | null;
  errorCodeBreakdown: Record<string, number>;
  byToolId: Record<string, { total: number; successRate: number | null }>;
}

/** 纯计算函数：从 ToolInvocation 记录计算工具调用可靠性指标。不访问 DB。 */
export function computeToolReliability(input: ToolInvocationRow[], dataSource: DataSource): MetricComputeOutput<ToolReliabilityData> {
  const total = input.length;
  const completed = input.filter((r) => r.status === "completed").length;
  const failed = input.filter((r) => r.status === "failed").length;
  const replayed = input.filter((r) => r.replayed).length;

  const errorCodeCounts = new Map<string, number>();
  for (const row of input) {
    if (!row.errorCode) continue;
    errorCodeCounts.set(row.errorCode, (errorCodeCounts.get(row.errorCode) ?? 0) + 1);
  }

  const byToolId = new Map<string, { total: number; completed: number }>();
  for (const row of input) {
    const bucket = byToolId.get(row.toolId) ?? { total: 0, completed: 0 };
    bucket.total += 1;
    if (row.status === "completed") bucket.completed += 1;
    byToolId.set(row.toolId, bucket);
  }

  const validity = computeValidity({ hasDegenerate: false, sampleSize: total, dataSource });

  return {
    metric: "tool-reliability",
    validity,
    data: {
      sampleSize: total,
      successRate: total === 0 ? null : completed / total,
      failureRate: total === 0 ? null : failed / total,
      replayHitRate: total === 0 ? null : replayed / total,
      errorCodeBreakdown: Object.fromEntries(errorCodeCounts),
      byToolId: Object.fromEntries(
        Array.from(byToolId.entries()).map(([toolId, bucket]) => [
          toolId,
          { total: bucket.total, successRate: bucket.total === 0 ? null : bucket.completed / bucket.total },
        ]),
      ),
    },
    limitation: total === 0 ? "No ToolInvocation rows found; run the workflow before trusting this output." : undefined,
  };
}

async function main() {
  const dataSource = parseDataSourceCli();
  const invocations = await prisma.toolInvocation.findMany({
    select: { status: true, errorCode: true, replayed: true, toolId: true },
  });
  const result = computeToolReliability(invocations, dataSource);
  console.log(JSON.stringify({ ...result, ok: true }, null, 2));
  if (result.validity === "invalid") process.exitCode = 0;
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
