import { prisma } from "../../src/lib/db";

function parseFailures(failuresJson: string): unknown[] {
  try {
    const parsed = JSON.parse(failuresJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  const workflows = await prisma.reviewWorkflow.findMany({
    select: { failuresJson: true, currentRound: true, status: true },
  });

  const total = workflows.length;
  const firstPassClean = workflows.filter((row) => parseFailures(row.failuresJson).length === 0).length;
  const revised = workflows.filter((row) => row.currentRound > 0);
  const revisedRecovered = revised.filter((row) => row.status !== "partial").length;

  console.log(JSON.stringify({
    metric: "structured-output-quality",
    sampleSize: total,
    firstPassCleanRate: total === 0 ? null : firstPassClean / total,
    revisedSampleSize: revised.length,
    postRevisionRecoveryRate: revised.length === 0 ? null : revisedRecovered / revised.length,
    limitation: total === 0 ? "No ReviewWorkflow rows found; run the workflow before trusting this output." : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
