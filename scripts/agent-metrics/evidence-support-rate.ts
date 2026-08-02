import { prisma } from "../../src/lib/db";

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

async function main() {
  const workflows = await prisma.reviewWorkflow.findMany({ select: { evaluationJson: true } });

  let totalSupported = 0;
  let totalIgnored = 0;
  let workflowsWithFindings = 0;

  for (const row of workflows) {
    const evaluation = parseEvaluation(row.evaluationJson);
    if (!evaluation) continue;
    const findingCount = evaluation.supportedFindingIds.length + evaluation.ignoredFindingIds.length;
    if (findingCount === 0) continue;
    workflowsWithFindings += 1;
    totalSupported += evaluation.supportedFindingIds.length;
    totalIgnored += evaluation.ignoredFindingIds.length;
  }

  const totalFindings = totalSupported + totalIgnored;

  console.log(JSON.stringify({
    metric: "evidence-support-rate",
    sampleSize: workflows.length,
    workflowsWithFindings,
    totalFindings,
    supportedFindingCount: totalSupported,
    ignoredFindingCount: totalIgnored,
    evidenceSupportRate: totalFindings === 0 ? null : totalSupported / totalFindings,
    limitation: workflowsWithFindings === 0 ? "No ReviewWorkflow rows with findings found; run cross_review before trusting this output." : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
