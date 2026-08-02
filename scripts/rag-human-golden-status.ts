import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  HUMAN_GOLDEN_DOCUMENT_TYPES,
  type HumanGoldenDocumentType,
} from "../src/lib/rag/human-golden-set";
import { inspectHumanGoldenAnnotationPackage } from "../src/lib/rag/human-golden-status";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_STATUS_FLAG_REQUIRED: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`RAG_HUMAN_GOLDEN_STATUS_NUMBER_INVALID: ${name}`);
  return parsed;
}

function requiredDocumentTypes() {
  const value = option("--required-document-types");
  if (!value) return undefined;
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!parsed.length) throw new Error("RAG_HUMAN_GOLDEN_STATUS_REQUIRED_DOCUMENT_TYPES_REQUIRED");
  if (!parsed.every((item): item is HumanGoldenDocumentType => HUMAN_GOLDEN_DOCUMENT_TYPES.includes(item as HumanGoldenDocumentType))) {
    throw new Error("RAG_HUMAN_GOLDEN_STATUS_REQUIRED_DOCUMENT_TYPE_INVALID");
  }
  return parsed;
}

async function main() {
  const inputPath = path.resolve(required("--input"));
  const files = {
    "sources.tsv": await readFile(path.join(inputPath, "sources.tsv"), "utf8"),
    "chunks.tsv": await readFile(path.join(inputPath, "chunks.tsv"), "utf8"),
    "cases.tsv": await readFile(path.join(inputPath, "cases.tsv"), "utf8"),
  };

  const report = inspectHumanGoldenAnnotationPackage({
    files,
    minimumCaseCount: positiveInteger("--minimum-case-count", 100),
    requiredDocumentTypes: requiredDocumentTypes(),
  });

  console.log(JSON.stringify({
    ...report,
    inputPath,
  }, null, 2));
  if (report.status === "invalid") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
