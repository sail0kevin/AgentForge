import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Chunk } from "../src/lib/rag/chunker";
import { buildHumanGoldenAnnotationPackage } from "../src/lib/rag/human-golden-package";
import { assertPathWithinLocalOnly } from "./local-only-path";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_PREPARE_FLAG_REQUIRED: ${name}`);
  return value;
}

async function main() {
  const corpusPath = path.resolve(required("--corpus"));
  const sourcesPath = path.resolve(required("--sources"));
  const outputPath = path.resolve(required("--output"));
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_PREPARE_OUTPUT_MUST_BE_LOCAL_ONLY");

  const chunks = JSON.parse(await readFile(corpusPath, "utf8")) as Chunk[];
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const files = buildHumanGoldenAnnotationPackage(chunks, sources);
  await mkdir(outputPath, { recursive: true });
  await Promise.all(Object.entries(files).map(([fileName, content]) => writeFile(path.join(outputPath, fileName), content, "utf8")));

  console.log(JSON.stringify({
    status: "prepared",
    outputPath,
    sourceCount: sources.length,
    chunkCount: chunks.length,
    casesRequireHumanAnnotation: true,
    generatedFiles: Object.keys(files),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
