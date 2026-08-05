import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isWithinLocalOnly } from "@/lib/review/ablation-authorization";
import { createAblationRunPlan } from "@/lib/review/ablation-protocol";
import { validateLightweightCaseManifest, type LightweightCaseManifest } from "@/lib/review/lightweight-case-manifest";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const manifestPath = path.resolve(flagValue("--manifest") ?? "docs/quality - 璐乮噺璁勬祴/lightweight-case-manifest.json");
  const trialCount = Number.parseInt(flagValue("--trials") ?? "3", 10);
  const outputPath = flagValue("--output");
  const partitionIndex = Number.parseInt(flagValue("--partition") ?? "0", 10);
  const partitionCount = Number.parseInt(flagValue("--partition-count") ?? "4", 10);
  const seed = Number.parseInt(flagValue("--seed") ?? "20260801", 10);

  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > 100) throw new Error("ABLATION_TRIAL_COUNT_INVALID");
  if (!Number.isInteger(partitionIndex) || partitionIndex < 0) throw new Error("ABLATION_PARTITION_INDEX_INVALID");
  if (!Number.isInteger(partitionCount) || partitionCount < 1) throw new Error("ABLATION_PARTITION_COUNT_INVALID");
  if (partitionIndex >= partitionCount) throw new Error("ABLATION_PARTITION_INDEX_OUT_OF_RANGE");

  const raw = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = validateLightweightCaseManifest(raw);

  // 按 caseId 排序后均匀分区，保证每个 partition 有完整的 case 集合
  const sortedCases = [...manifest.cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
  const partitionCases = sortedCases.filter((_, i) => i % partitionCount === partitionIndex);

  if (partitionCases.length === 0) throw new Error("ABLATION_PARTITION_EMPTY");

  const subManifest: LightweightCaseManifest = {
    ...manifest,
    cases: partitionCases,
  };

  const plan = createAblationRunPlan(subManifest, trialCount, seed);

  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    if (!isWithinLocalOnly(resolvedOutputPath, process.cwd())) throw new Error("ABLATION_PLAN_OUTPUT_MUST_BE_LOCAL_ONLY");
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    console.error(JSON.stringify({
      status: "frozen",
      partition: `${partitionIndex}/${partitionCount}`,
      casesInPartition: partitionCases.map((c) => c.caseId),
      plannedRunCount: plan.runs.length,
      outputPath: resolvedOutputPath,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ plan }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
