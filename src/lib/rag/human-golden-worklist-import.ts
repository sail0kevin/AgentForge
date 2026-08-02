import { HumanGoldenCaseSchema } from "./human-golden-set";

type TsvRecord = Record<string, string>;

export type ConvertReviewedWorklistOptions = {
  minimumApprovedCount?: number;
};

export type ConvertReviewedWorklistResult = {
  casesTsv: string;
  approvedCaseCount: number;
  skippedRowCount: number;
  sourceRowNumbers: number[];
};

type ParsedWorklistRow = {
  rowNumber: number;
  record: TsvRecord;
};

const CASE_HEADER = "caseId\tquery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\n";
const REVIEW_STATUSES_TO_SKIP = new Set(["", "rejected", "needs-revision"]);

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function cleanTsvCell(value: string) {
  return value.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function tsvRow(values: string[]) {
  return `${values.map(cleanTsvCell).join("\t")}\n`;
}

function parseWorklistTsv(content: string) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const headerLine = lines.shift() ?? "";
  if (!headerLine.trim()) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_HEADER_MISSING");
  const headers = headerLine.split("\t");
  if (!headers.every((header) => header.trim())) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_HEADER_INVALID");
  if (new Set(headers).size !== headers.length) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_HEADER_DUPLICATE");

  const rows: ParsedWorklistRow[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    if (!line.trim()) continue;
    const rowNumber = lineIndex + 2;
    const cells = line.split("\t");
    if (cells.length > headers.length) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_COLUMN_COUNT_INVALID: row ${rowNumber}`);
    }
    const paddedCells = [...cells, ...Array.from({ length: headers.length - cells.length }, () => "")];
    rows.push({
      rowNumber,
      record: Object.fromEntries(headers.map((header, cellIndex) => [header, paddedCells[cellIndex].trim()])),
    });
  }
  if (!rows.length) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_NO_RECORDS");
  return rows;
}

function required(record: TsvRecord, key: string, rowNumber: number) {
  const value = record[key]?.trim() ?? "";
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_APPROVED_FIELD_MISSING: row ${rowNumber}:${key}`);
  return value;
}

function derivedCaseId(record: TsvRecord, rowNumber: number) {
  const explicitCaseId = record.caseId?.trim();
  if (explicitCaseId) return explicitCaseId;
  const taskId = required(record, "taskId", rowNumber);
  if (!/^rag-worklist-[a-z0-9][a-z0-9-]*$/.test(taskId)) {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_TASK_ID_INVALID: row ${rowNumber}`);
  }
  return taskId.replace(/^rag-worklist-/, "rag-case-");
}

function parseRelevantChunks(record: TsvRecord, rowNumber: number) {
  try {
    return JSON.parse(required(record, "relevantChunksJson", rowNumber)) as unknown;
  } catch {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_RELEVANCE_JSON_INVALID: row ${rowNumber}`);
  }
}

/**
 * 将已审核的 worklist 行转换为 cases.tsv。它只接受人工填写并被独立 reviewer 批准的行，
 * 不会根据 chunk preview 自动生成 query、相关性标签或任何检索指标。
 */
export function convertReviewedWorklistToCasesTsv(
  worklistTsv: string,
  options: ConvertReviewedWorklistOptions = {},
): ConvertReviewedWorklistResult {
  const minimumApprovedCount = options.minimumApprovedCount ?? 1;
  if (!Number.isInteger(minimumApprovedCount) || minimumApprovedCount < 1) {
    throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_MINIMUM_APPROVED_INVALID");
  }

  const rows = parseWorklistTsv(worklistTsv);
  const approvedRows: string[] = [];
  const sourceRowNumbers: number[] = [];
  const seenCaseIds = new Map<string, number>();
  const seenQueries = new Map<string, number>();
  let skippedRowCount = 0;

  for (const row of rows) {
    const reviewStatus = (row.record.reviewStatus ?? "").trim();
    if (REVIEW_STATUSES_TO_SKIP.has(reviewStatus)) {
      skippedRowCount += 1;
      continue;
    }
    if (reviewStatus !== "approved") {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_REVIEW_STATUS_INVALID: row ${row.rowNumber}`);
    }

    const relevantChunks = parseRelevantChunks(row.record, row.rowNumber);
    const candidate = {
      caseId: derivedCaseId(row.record, row.rowNumber),
      query: required(row.record, "humanQuery", row.rowNumber),
      queryType: required(row.record, "queryType", row.rowNumber),
      relevantChunks,
      annotatedBy: required(row.record, "annotatedBy", row.rowNumber),
      annotatedAt: required(row.record, "annotatedAt", row.rowNumber),
      reviewedBy: required(row.record, "reviewedBy", row.rowNumber),
      reviewedAt: required(row.record, "reviewedAt", row.rowNumber),
      reviewStatus,
    };
    const result = HumanGoldenCaseSchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_APPROVED_ROW_INVALID: row ${row.rowNumber}: ${result.error.issues.map((issue) => `${issue.path.join(".") || "row"} ${issue.message}`).join("; ")}`);
    }
    if (result.data.annotatedBy === result.data.reviewedBy) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_REVIEW_NOT_INDEPENDENT: row ${row.rowNumber}`);
    }
    if (Date.parse(result.data.reviewedAt) < Date.parse(result.data.annotatedAt)) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_REVIEW_BEFORE_ANNOTATION: row ${row.rowNumber}`);
    }
    const selectedChunkId = required(row.record, "chunkId", row.rowNumber);
    if (!result.data.relevantChunks.some((item) => item.chunkId === selectedChunkId && item.relevance >= 2)) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_SELECTED_CHUNK_NOT_RELEVANT: row ${row.rowNumber}`);
    }
    const duplicateRelevantChunk = result.data.relevantChunks.find((item, index, chunks) => chunks.findIndex((candidateChunk) => candidateChunk.chunkId === item.chunkId) !== index);
    if (duplicateRelevantChunk) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_RELEVANCE_DUPLICATE: row ${row.rowNumber}:${duplicateRelevantChunk.chunkId}`);
    }
    const previousCaseRow = seenCaseIds.get(result.data.caseId);
    if (previousCaseRow !== undefined) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_CASE_DUPLICATE: row ${row.rowNumber} duplicates row ${previousCaseRow}`);
    }
    const normalizedQuery = normalizeQuery(result.data.query);
    const previousQueryRow = seenQueries.get(normalizedQuery);
    if (previousQueryRow !== undefined) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_QUERY_DUPLICATE: row ${row.rowNumber} duplicates row ${previousQueryRow}`);
    }
    seenCaseIds.set(result.data.caseId, row.rowNumber);
    seenQueries.set(normalizedQuery, row.rowNumber);
    sourceRowNumbers.push(row.rowNumber);
    approvedRows.push(tsvRow([
      result.data.caseId,
      result.data.query,
      result.data.queryType,
      JSON.stringify(result.data.relevantChunks),
      result.data.annotatedBy,
      result.data.annotatedAt,
      result.data.reviewedBy,
      result.data.reviewedAt,
      result.data.reviewStatus,
    ]));
  }

  if (approvedRows.length < minimumApprovedCount) {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_APPROVED_COUNT_BELOW_MINIMUM: ${approvedRows.length} < ${minimumApprovedCount}`);
  }

  return {
    casesTsv: `${CASE_HEADER}${approvedRows.join("")}`,
    approvedCaseCount: approvedRows.length,
    skippedRowCount,
    sourceRowNumbers,
  };
}
