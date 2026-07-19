import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateBlindCaseManifest } from "../src/lib/review/blind-case-manifest";
import { validateBlindStudyAgainstPlan } from "../src/lib/review/blind-study-preflight";

function value(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function main() {
  const inputPath = value("--input");
  if (!inputPath) throw new Error("Usage: --input local-only/blind-evaluation/input.json [--manifest path]");
  const manifestPath = value("--manifest") ?? "docs/quality - 质量评测/case-manifest.json";
  const manifest = validateBlindCaseManifest(await readJson(manifestPath));
  const input = validateBlindStudyAgainstPlan(await readJson(inputPath), manifest);
  console.log(JSON.stringify({
    inputPath: path.resolve(inputPath),
    manifestPath: path.resolve(manifestPath),
    studyId: input.studyId,
    runCount: input.runs.length,
    caseCount: new Set(input.runs.map((run) => run.caseId)).size,
    manifestSha256: input.metadata.caseManifestSha256,
    status: "ready-for-anonymization",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
