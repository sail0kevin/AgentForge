import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateBlindCaseManifest } from "../src/lib/review/blind-case-manifest";
import { createBlindRunPlan } from "../src/lib/review/blind-run-plan";

function value(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const manifestPath = path.resolve(value("--manifest") ?? "docs/quality - 质量评测/case-manifest.json");
  const manifest = validateBlindCaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const plan = createBlindRunPlan(manifest);
  const output = value("--output");
  if (output) {
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    manifestPath,
    output: output ? path.resolve(output) : null,
    caseManifestSha256: plan.caseManifestSha256,
    caseCount: new Set(plan.runs.map((run) => run.caseId)).size,
    variantCount: new Set(plan.runs.map((run) => run.variant)).size,
    runCount: plan.runs.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
