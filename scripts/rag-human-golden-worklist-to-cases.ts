import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertReviewedWorklistToCasesTsv } from "../src/lib/rag/human-golden-worklist-import";
import { assertPathWithinLocalOnly } from "./local-only-path";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_TO_CASES_FLAG_REQUIRED: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_TO_CASES_NUMBER_INVALID: ${name}`);
  return parsed;
}

async function main() {
  const inputPath = path.resolve(required("--input"));
  const outputPath = path.resolve(required("--output"));
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_WORKLIST_TO_CASES_OUTPUT_MUST_BE_LOCAL_ONLY");

  const result = convertReviewedWorklistToCasesTsv(await readFile(inputPath, "utf8"), {
    minimumApprovedCount: positiveInteger("--minimum-approved-count", 1),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.casesTsv, "utf8");

  console.log(JSON.stringify({
    status: "cases_tsv_written",
    inputPath,
    outputPath,
    approvedCaseCount: result.approvedCaseCount,
    skippedRowCount: result.skippedRowCount,
    sourceRowNumbers: result.sourceRowNumbers,
    limitation: "This command only promotes reviewed human annotations into cases.tsv. It does not calculate Recall@5, MRR, NDCG, cost, or production RAG quality.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
