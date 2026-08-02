import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Chunk } from "../src/lib/rag/chunker";
import type { HumanGoldenSourceManifestEntry } from "../src/lib/rag/human-golden-package";
import { buildHumanGoldenAnnotationWorklist } from "../src/lib/rag/human-golden-worklist";
import { assertPathWithinLocalOnly } from "./local-only-path";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_FLAG_REQUIRED: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_NUMBER_INVALID: ${name}`);
  return parsed;
}

function integer(name: string, fallback: number) {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_NUMBER_INVALID: ${name}`);
  return parsed;
}

async function main() {
  const corpusPath = path.resolve(required("--corpus"));
  const sourcesPath = path.resolve(required("--sources"));
  const outputPath = path.resolve(required("--output"));
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_WORKLIST_OUTPUT_MUST_BE_LOCAL_ONLY");

  const chunks = JSON.parse(await readFile(corpusPath, "utf8")) as Chunk[];
  const sources = JSON.parse(await readFile(sourcesPath, "utf8")) as HumanGoldenSourceManifestEntry[];
  const files = buildHumanGoldenAnnotationWorklist(chunks, sources, {
    targetCaseCount: positiveInteger("--target-case-count", 100),
    seed: integer("--seed", 20260802),
  });

  await mkdir(outputPath, { recursive: true });
  await Promise.all(Object.entries(files).map(([fileName, content]) => writeFile(path.join(outputPath, fileName), content, "utf8")));

  console.log(JSON.stringify({
    status: "worklist_generated",
    outputPath,
    generatedFiles: Object.keys(files),
    summary: JSON.parse(files["summary.json"]),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
