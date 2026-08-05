import { prisma } from "../../src/lib/db";
import { type DataSource, type MetricComputeOutput, computeValidity } from "./lib/metric-types";

export interface ReviewWorkflowRow {
  failuresJson: string;
  currentRound: number;
  status: string;
}

export interface StructuredOutputData {
  sampleSize: number;
  firstPassCleanRate: number | null;
  revisedSampleSize: number;
  postRevisionRecoveryRate: number | null;
}

function parseFailures(failuresJson: string): unknown[] {
  try {
    const parsed = JSON.parse(failuresJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function computeStructuredOutputQuality(input: ReviewWorkflowRow[], dataSource: DataSource): MetricComputeOutput<StructuredOutputData> {
  const total = input.length;
  const firstPassClean = input.filter((row) => parseFailures(row.failuresJson).length === 0).length;
  const revised = input.filter((row) => row.currentRound > 0);
  const revisedRecovered = revised.filter((row) => row.status !== "partial").length;

  const validity = computeValidity({ hasDegenerate: false, sampleSize: total, dataSource });

  return {
    metric: "structured-output-quality",
    validity,
    data: {
      sampleSize: total,
      firstPassCleanRate: total === 0 ? null : firstPassClean / total,
      revisedSampleSize: revised.length,
      postRevisionRecoveryRate: revised.length === 0 ? null : revisedRecovered / revised.length,
    },
    limitation: total === 0 ? "No ReviewWorkflow rows found; run the workflow before trusting this output." : undefined,
  };
}

async function main() {
  const dataSource = parseDataSourceCli();
  const workflows = await prisma.reviewWorkflow.findMany({
    select: { failuresJson: true, currentRound: true, status: true },
  });
  const result = computeStructuredOutputQuality(workflows, dataSource);
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
