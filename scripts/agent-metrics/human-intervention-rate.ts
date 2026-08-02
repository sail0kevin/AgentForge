import { prisma } from "../../src/lib/db";

function parseDecision(evaluationJson: string | null): string | null {
  if (!evaluationJson) return null;
  try {
    const parsed = JSON.parse(evaluationJson);
    return typeof parsed.decision === "string" ? parsed.decision : null;
  } catch {
    return null;
  }
}

async function main() {
  const workflows = await prisma.reviewWorkflow.findMany({
    select: { evaluationJson: true, currentRound: true, approvalStatus: true },
  });

  const total = workflows.length;
  const needsHuman = workflows.filter((row) => parseDecision(row.evaluationJson) === "needs_human").length;
  const awaitingOrDecidedByHuman = workflows.filter((row) => row.approvalStatus !== "not_required").length;
  const averageRevisionRounds = total === 0 ? null : workflows.reduce((sum, row) => sum + row.currentRound, 0) / total;

  console.log(JSON.stringify({
    metric: "human-intervention-rate",
    sampleSize: total,
    needsHumanDecisionRate: total === 0 ? null : needsHuman / total,
    approvalGateTriggeredRate: total === 0 ? null : awaitingOrDecidedByHuman / total,
    averageRevisionRounds,
    limitation: total === 0 ? "No ReviewWorkflow rows found; run the workflow before trusting this output." : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
