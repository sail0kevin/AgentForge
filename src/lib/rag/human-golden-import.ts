import { createHash } from "node:crypto";
import {
  HUMAN_RAG_GOLDEN_SET_SCHEMA_VERSION,
  validateHumanGoldenSet,
  type HumanGoldenSet,
} from "./human-golden-set";

type TsvRecord = Record<string, string>;

type HumanGoldenAnnotationFileName = "sources.tsv" | "chunks.tsv" | "cases.tsv";

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * 标注模板使用 TSV，避免中文 query 与 JSON 相关 chunk 中的英文逗号破坏 CSV 列边界。
 * 该解析器刻意只接受模板生成的扁平表头，不支持猜测或修复损坏行。
 */
export function parseAnnotationTsv(content: string, fileName: string): TsvRecord[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) throw new Error(`HUMAN_GOLDEN_TSV_EMPTY: ${fileName}`);
  const [headerLine, ...lines] = normalized.split("\n");
  const headers = headerLine.split("\t");
  if (!headers.every((header) => header.trim())) throw new Error(`HUMAN_GOLDEN_TSV_HEADER_INVALID: ${fileName}`);
  if (new Set(headers).size !== headers.length) throw new Error(`HUMAN_GOLDEN_TSV_HEADER_DUPLICATE: ${fileName}`);

  const records = lines.filter((line) => line.trim()).map((line, index) => {
    const cells = line.split("\t");
    if (cells.length !== headers.length) {
      throw new Error(`HUMAN_GOLDEN_TSV_COLUMN_COUNT_INVALID: ${fileName}:${index + 2}`);
    }
    return Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex].trim()]));
  });
  if (!records.length) throw new Error(`HUMAN_GOLDEN_TSV_NO_RECORDS: ${fileName}`);
  return records;
}

function requiredValue(record: TsvRecord, key: string, fileName: string, rowNumber: number) {
  const value = record[key];
  if (!value) throw new Error(`HUMAN_GOLDEN_TSV_VALUE_MISSING: ${fileName}:${rowNumber}:${key}`);
  return value;
}

export type HumanGoldenAnnotationFiles = Record<HumanGoldenAnnotationFileName, string>;

export type BuildHumanGoldenSetInput = {
  datasetId: string;
  frozenAt: string;
  snapshotId: string;
  files: HumanGoldenAnnotationFiles;
};

/**
 * 将人工填写的三张 TSV 表编译为冻结 JSON。来源快照只由来源和 chunk 清单决定，
 * 因此 query 标注更新不会伪装成同一份检索语料快照。
 */
export function buildHumanGoldenSetFromTsv(input: BuildHumanGoldenSetInput): HumanGoldenSet {
  const sources = parseAnnotationTsv(input.files["sources.tsv"], "sources.tsv").map((record, index) => ({
    sourceId: requiredValue(record, "sourceId", "sources.tsv", index + 2),
    documentId: requiredValue(record, "documentId", "sources.tsv", index + 2),
    documentType: requiredValue(record, "documentType", "sources.tsv", index + 2),
    version: requiredValue(record, "version", "sources.tsv", index + 2),
    contentSha256: requiredValue(record, "contentSha256", "sources.tsv", index + 2),
    license: requiredValue(record, "license", "sources.tsv", index + 2),
  }));
  const chunks = parseAnnotationTsv(input.files["chunks.tsv"], "chunks.tsv").map((record, index) => ({
    chunkId: requiredValue(record, "chunkId", "chunks.tsv", index + 2),
    sourceId: requiredValue(record, "sourceId", "chunks.tsv", index + 2),
    documentId: requiredValue(record, "documentId", "chunks.tsv", index + 2),
    contentSha256: requiredValue(record, "contentSha256", "chunks.tsv", index + 2),
  }));
  const cases = parseAnnotationTsv(input.files["cases.tsv"], "cases.tsv").map((record, index) => {
    const rowNumber = index + 2;
    let relevantChunks: unknown;
    try {
      relevantChunks = JSON.parse(requiredValue(record, "relevantChunksJson", "cases.tsv", rowNumber));
    } catch {
      throw new Error(`HUMAN_GOLDEN_TSV_RELEVANCE_JSON_INVALID: cases.tsv:${rowNumber}`);
    }
    return {
      caseId: requiredValue(record, "caseId", "cases.tsv", rowNumber),
      query: requiredValue(record, "query", "cases.tsv", rowNumber),
      queryType: requiredValue(record, "queryType", "cases.tsv", rowNumber),
      relevantChunks,
      annotatedBy: requiredValue(record, "annotatedBy", "cases.tsv", rowNumber),
      annotatedAt: requiredValue(record, "annotatedAt", "cases.tsv", rowNumber),
      reviewedBy: requiredValue(record, "reviewedBy", "cases.tsv", rowNumber),
      reviewedAt: requiredValue(record, "reviewedAt", "cases.tsv", rowNumber),
      reviewStatus: requiredValue(record, "reviewStatus", "cases.tsv", rowNumber),
    };
  });

  const sourceSnapshotPayload = JSON.stringify({ sources, chunks });
  return validateHumanGoldenSet({
    schemaVersion: HUMAN_RAG_GOLDEN_SET_SCHEMA_VERSION,
    datasetId: input.datasetId,
    frozenAt: input.frozenAt,
    sourceSnapshot: { snapshotId: input.snapshotId, sha256: sha256(sourceSnapshotPayload) },
    sources,
    chunks,
    cases,
  });
}

export const humanGoldenAnnotationTemplate = {
  "sources.tsv": "sourceId\tdocumentId\tdocumentType\tversion\tcontentSha256\tlicense\n",
  "chunks.tsv": "chunkId\tsourceId\tdocumentId\tcontentSha256\n",
  "cases.tsv": "caseId\tquery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\n",
} as const;
