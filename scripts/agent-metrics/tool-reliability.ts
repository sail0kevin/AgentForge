import { prisma } from "../../src/lib/db";

async function main() {
  const invocations = await prisma.toolInvocation.findMany({
    select: { status: true, errorCode: true, replayed: true, toolId: true },
  });

  const total = invocations.length;
  const completed = invocations.filter((row) => row.status === "completed").length;
  const failed = invocations.filter((row) => row.status === "failed").length;
  const replayed = invocations.filter((row) => row.replayed).length;

  const errorCodeCounts = new Map<string, number>();
  for (const row of invocations) {
    if (!row.errorCode) continue;
    errorCodeCounts.set(row.errorCode, (errorCodeCounts.get(row.errorCode) ?? 0) + 1);
  }

  const byToolId = new Map<string, { total: number; completed: number }>();
  for (const row of invocations) {
    const bucket = byToolId.get(row.toolId) ?? { total: 0, completed: 0 };
    bucket.total += 1;
    if (row.status === "completed") bucket.completed += 1;
    byToolId.set(row.toolId, bucket);
  }

  console.log(JSON.stringify({
    metric: "tool-reliability",
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
    limitation: total === 0 ? "No ToolInvocation rows found; run the workflow before trusting this output." : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
