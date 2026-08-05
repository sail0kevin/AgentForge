import { prisma } from "../../src/lib/db";
import { type DataSource, type MetricComputeOutput, computeValidity } from "./lib/metric-types";

export interface ReviewWorkflowEvalRow {
  evaluationJson: string | null;
}

export interface EvidenceSupportData {
  sampleSize: number;
  workflowsWithFindings: number;
  totalFindings: number;
  supportedFindingCount: number;
  ignoredFindingCount: number;
  evidenceSupportRate: number | null;
}

function parseEvaluation(evaluationJson: string | null): { supportedFindingIds: string[]; ignoredFindingIds: string[] } | null {
  if (!evaluationJson) return null;
  try {
    const parsed = JSON.parse(evaluationJson);
    return {
      supportedFindingIds: Array.isArray(parsed.supportedFindingIds) ? parsed.supportedFindingIds : [],
      ignoredFindingIds: Array.isArray(parsed.ignoredFindingIds) ? parsed.ignoredFindingIds : [],
    };
  } catch {
    return null;
  }
}

export function computeEvidenceSupportRate(input: ReviewWorkflowEvalRow[], dataSource: DataSource): MetricComputeOutput<EvidenceSupportData> {
  let totalSupported = 0;
  let totalIgnored = 0;
  let workflowsWithFindings = 0;

  for (const row of input) {
    const evaluation = parseEvaluation(row.evaluationJson);
    if (!evaluation) continue;
    const findingCount = evaluation.supportedFindingIds.length + evaluation.ignoredFindingIds.length;
    if (findingCount === 0) continue;
    workflowsWithFindings += 1;
    totalSupported += evaluation.supportedFindingIds.length;
    totalIgnored += evaluation.ignoredFindingIds.length;
  }

  const totalFindings = totalSupported + totalIgnored;
  const sampleSize = input.length;
  const validity = computeValidity({ hasDegenerate: false, sampleSize, dataSource });

  return {
    metric: "evidence-support-rate",
    validity,
    data: {
      sampleSize,
      workflowsWithFindings,
      totalFindings,
      supportedFindingCount: totalSupported,
      ignoredFindingCount: totalIgnored,
      evidenceSupportRate: totalFindings === 0 ? null : totalSupported / totalFindings,
    },
    limitation: workflowsWithFindings === 0 ? "No ReviewWorkflow rows with findings found; run cross_review before trusting this output." : undefined,
  };
}

async function main() {
  const dataSource = parseDataSourceCli();
  const workflows = await prisma.reviewWorkflow.findMany({ select: { evaluationJson: true } });
  const result = computeEvidenceSupportRate(workflows, dataSource);
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
