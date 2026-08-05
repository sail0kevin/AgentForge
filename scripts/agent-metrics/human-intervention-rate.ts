import { prisma } from "../../src/lib/db";
import { type DataSource, type MetricComputeOutput, computeValidity } from "./lib/metric-types";

export interface ReviewWorkflowDecisionRow {
  evaluationJson: string | null;
  currentRound: number;
  approvalStatus: string;
}

export interface HumanInterventionData {
  sampleSize: number;
  needsHumanDecisionRate: number | null;
  approvalGateTriggeredRate: number | null;
  averageRevisionRounds: number | null;
}

function parseDecision(evaluationJson: string | null): string | null {
  if (!evaluationJson) return null;
  try {
    const parsed = JSON.parse(evaluationJson);
    return typeof parsed.decision === "string" ? parsed.decision : null;
  } catch {
    return null;
  }
}

export function computeHumanInterventionRate(input: ReviewWorkflowDecisionRow[], dataSource: DataSource): MetricComputeOutput<HumanInterventionData> {
  const total = input.length;
  const needsHuman = input.filter((row) => parseDecision(row.evaluationJson) === "needs_human").length;
  const awaitingOrDecidedByHuman = input.filter((row) => row.approvalStatus !== "not_required").length;
  const averageRevisionRounds = total === 0 ? null : input.reduce((sum, row) => sum + row.currentRound, 0) / total;

  const validity = computeValidity({ hasDegenerate: false, sampleSize: total, dataSource });

  return {
    metric: "human-intervention-rate",
    validity,
    data: {
      sampleSize: total,
      needsHumanDecisionRate: total === 0 ? null : needsHuman / total,
      approvalGateTriggeredRate: total === 0 ? null : awaitingOrDecidedByHuman / total,
      averageRevisionRounds,
    },
    limitation: total === 0 ? "No ReviewWorkflow rows found; run the workflow before trusting this output." : undefined,
  };
}

async function main() {
  const dataSource = parseDataSourceCli();
  const workflows = await prisma.reviewWorkflow.findMany({
    select: { evaluationJson: true, currentRound: true, approvalStatus: true },
  });
  const result = computeHumanInterventionRate(workflows, dataSource);
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
