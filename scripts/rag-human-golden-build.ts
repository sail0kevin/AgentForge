import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHumanGoldenSetFromTsv } from "../src/lib/rag/human-golden-import";
import { assertPathWithinLocalOnly } from "./local-only-path";

function value(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(flag: string) {
  const result = value(flag);
  if (!result) throw new Error(`RAG_HUMAN_GOLDEN_BUILD_FLAG_REQUIRED: ${flag}`);
  return result;
}

async function main() {
  const inputPath = path.resolve(required("--input"));
  const outputPath = path.resolve(required("--output"));
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_BUILD_OUTPUT_MUST_BE_LOCAL_ONLY");
  const files = await Promise.all(["sources.tsv", "chunks.tsv", "cases.tsv"].map(async (fileName) => [fileName, await readFile(path.join(inputPath, fileName), "utf8")] as const));
  const dataset = buildHumanGoldenSetFromTsv({
    datasetId: required("--dataset-id"),
    frozenAt: required("--frozen-at"),
    snapshotId: required("--snapshot-id"),
    files: Object.fromEntries(files) as { "sources.tsv": string; "chunks.tsv": string; "cases.tsv": string },
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "built", outputPath, datasetId: dataset.datasetId, caseCount: dataset.cases.length, sourceSnapshot: dataset.sourceSnapshot }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
