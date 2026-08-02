import {
  HUMAN_GOLDEN_DOCUMENT_TYPES,
  HumanGoldenCaseSchema,
  HumanGoldenChunkSchema,
  HumanGoldenSourceSchema,
  type HumanGoldenDocumentType,
} from "./human-golden-set";

type TsvRecord = Record<string, string>;
type StatusFileName = "sources.tsv" | "chunks.tsv" | "cases.tsv";

export type HumanGoldenAnnotationStatusError = {
  fileName: StatusFileName;
  rowNumber?: number;
  code: string;
  message: string;
};

export type HumanGoldenAnnotationStatus = {
  status: "ready" | "not_ready" | "invalid";
  sourceCount: number;
  chunkCount: number;
  caseRowCount: number;
  validCaseCount: number;
  invalidCaseCount: number;
  minimumCaseCount: number;
  requiredDocumentTypes: HumanGoldenDocumentType[];
  documentTypes: Record<HumanGoldenDocumentType, number>;
  eligibleForBuild: boolean;
  eligibleForRetrievalEvaluation: boolean;
  readinessIssues: string[];
  errors: HumanGoldenAnnotationStatusError[];
  limitation: string;
};

export type InspectHumanGoldenAnnotationPackageInput = {
  files: Record<StatusFileName, string>;
  minimumCaseCount?: number;
  requiredDocumentTypes?: HumanGoldenDocumentType[];
};

const DEFAULT_REQUIRED_DOCUMENT_TYPES: HumanGoldenDocumentType[] = [
  "technical",
  "business",
  "api-reference",
];

type ParsedHumanGoldenCase = {
  caseId: string;
  query: string;
  queryType: "exact-keyword" | "semantic" | "multi-hop" | "comparison" | "troubleshooting";
  relevantChunks: Array<{ chunkId: string; relevance: 1 | 2 | 3 }>;
  annotatedBy: string;
  annotatedAt: string;
  reviewedBy: string;
  reviewedAt: string;
  reviewStatus: "approved";
};

function emptyDocumentTypes(): Record<HumanGoldenDocumentType, number> {
  return {
    technical: 0,
    business: 0,
    "api-reference": 0,
    runbook: 0,
    policy: 0,
    other: 0,
  };
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseTsvForStatus(content: string, fileName: StatusFileName) {
  const errors: HumanGoldenAnnotationStatusError[] = [];
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const headerLine = lines.shift() ?? "";
  const headers = headerLine.split("\t");
  const records: Array<{ rowNumber: number; record: TsvRecord }> = [];

  if (!headerLine.trim()) {
    errors.push({
      fileName,
      code: "HUMAN_GOLDEN_TSV_HEADER_MISSING",
      message: `${fileName} is missing a TSV header row.`,
    });
    return { records, errors };
  }
  if (!headers.every((header) => header.trim())) {
    errors.push({
      fileName,
      code: "HUMAN_GOLDEN_TSV_HEADER_INVALID",
      message: `${fileName} has an empty header cell.`,
    });
    return { records, errors };
  }
  if (new Set(headers).size !== headers.length) {
    errors.push({
      fileName,
      code: "HUMAN_GOLDEN_TSV_HEADER_DUPLICATE",
      message: `${fileName} has duplicate header names.`,
    });
    return { records, errors };
  }

  for (const [lineIndex, line] of lines.entries()) {
    const rowNumber = lineIndex + 2;
    if (!line.trim()) continue;
    const cells = line.split("\t");
    if (cells.length !== headers.length) {
      errors.push({
        fileName,
        rowNumber,
        code: "HUMAN_GOLDEN_TSV_COLUMN_COUNT_INVALID",
        message: `${fileName}:${rowNumber} has ${cells.length} columns; expected ${headers.length}.`,
      });
      continue;
    }
    records.push({
      rowNumber,
      record: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex].trim()])),
    });
  }

  return { records, errors };
}

function requiredField(record: TsvRecord, key: string) {
  return record[key]?.trim() ?? "";
}

function zodIssuesToMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ");
}

function addDuplicateErrors(
  rows: Array<{ rowNumber: number; value: string }>,
  fileName: StatusFileName,
  fieldName: string,
  errors: HumanGoldenAnnotationStatusError[],
) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const firstRow = seen.get(row.value);
    if (firstRow !== undefined) {
      errors.push({
        fileName,
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_TSV_DUPLICATE",
        message: `${fileName}:${row.rowNumber} duplicates ${fieldName} from row ${firstRow}.`,
      });
      continue;
    }
    seen.set(row.value, row.rowNumber);
  }
}

function parseSources(parsedRows: Array<{ rowNumber: number; record: TsvRecord }>, errors: HumanGoldenAnnotationStatusError[]) {
  const sources: Array<{ rowNumber: number; source: {
    sourceId: string;
    documentId: string;
    documentType: HumanGoldenDocumentType;
    version: string;
    contentSha256: string;
    license: string;
  } }> = [];

  for (const row of parsedRows) {
    const candidate = {
      sourceId: requiredField(row.record, "sourceId"),
      documentId: requiredField(row.record, "documentId"),
      documentType: requiredField(row.record, "documentType"),
      version: requiredField(row.record, "version"),
      contentSha256: requiredField(row.record, "contentSha256"),
      license: requiredField(row.record, "license"),
    };
    const result = HumanGoldenSourceSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        fileName: "sources.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_SOURCE_ROW_INVALID",
        message: zodIssuesToMessage(result.error),
      });
      continue;
    }
    sources.push({ rowNumber: row.rowNumber, source: result.data });
  }

  if (!parsedRows.length) {
    errors.push({
      fileName: "sources.tsv",
      code: "HUMAN_GOLDEN_TSV_NO_RECORDS",
      message: "sources.tsv must contain at least one frozen source row.",
    });
  }
  addDuplicateErrors(sources.map((row) => ({ rowNumber: row.rowNumber, value: row.source.sourceId })), "sources.tsv", "sourceId", errors);
  addDuplicateErrors(sources.map((row) => ({ rowNumber: row.rowNumber, value: row.source.documentId })), "sources.tsv", "documentId", errors);
  return sources;
}

function parseChunks(
  parsedRows: Array<{ rowNumber: number; record: TsvRecord }>,
  sources: ReturnType<typeof parseSources>,
  errors: HumanGoldenAnnotationStatusError[],
) {
  const chunks: Array<{ rowNumber: number; chunk: {
    chunkId: string;
    sourceId: string;
    documentId: string;
    contentSha256: string;
  } }> = [];
  const sourcesById = new Map(sources.map((row) => [row.source.sourceId, row.source]));

  for (const row of parsedRows) {
    const candidate = {
      chunkId: requiredField(row.record, "chunkId"),
      sourceId: requiredField(row.record, "sourceId"),
      documentId: requiredField(row.record, "documentId"),
      contentSha256: requiredField(row.record, "contentSha256"),
    };
    const result = HumanGoldenChunkSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        fileName: "chunks.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_CHUNK_ROW_INVALID",
        message: zodIssuesToMessage(result.error),
      });
      continue;
    }
    const source = sourcesById.get(result.data.sourceId);
    if (!source) {
      errors.push({
        fileName: "chunks.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_CHUNK_SOURCE_UNKNOWN",
        message: `${result.data.chunkId} references unknown source ${result.data.sourceId}.`,
      });
      continue;
    }
    if (source.documentId !== result.data.documentId) {
      errors.push({
        fileName: "chunks.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_CHUNK_DOCUMENT_MISMATCH",
        message: `${result.data.chunkId} does not belong to document ${result.data.documentId}.`,
      });
      continue;
    }
    chunks.push({ rowNumber: row.rowNumber, chunk: result.data });
  }

  if (!parsedRows.length) {
    errors.push({
      fileName: "chunks.tsv",
      code: "HUMAN_GOLDEN_TSV_NO_RECORDS",
      message: "chunks.tsv must contain at least one frozen chunk row.",
    });
  }
  addDuplicateErrors(chunks.map((row) => ({ rowNumber: row.rowNumber, value: row.chunk.chunkId })), "chunks.tsv", "chunkId", errors);
  return chunks;
}

function parseCases(
  parsedRows: Array<{ rowNumber: number; record: TsvRecord }>,
  chunks: ReturnType<typeof parseChunks>,
  errors: HumanGoldenAnnotationStatusError[],
) {
  const cases: Array<{ rowNumber: number; normalizedQuery: string; case: ParsedHumanGoldenCase }> = [];
  const chunkIds = new Set(chunks.map((row) => row.chunk.chunkId));

  for (const row of parsedRows) {
    let relevantChunks: unknown;
    try {
      relevantChunks = JSON.parse(requiredField(row.record, "relevantChunksJson"));
    } catch {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_TSV_RELEVANCE_JSON_INVALID",
        message: "relevantChunksJson must be valid JSON.",
      });
      continue;
    }

    const candidate = {
      caseId: requiredField(row.record, "caseId"),
      query: requiredField(row.record, "query"),
      queryType: requiredField(row.record, "queryType"),
      relevantChunks,
      annotatedBy: requiredField(row.record, "annotatedBy"),
      annotatedAt: requiredField(row.record, "annotatedAt"),
      reviewedBy: requiredField(row.record, "reviewedBy"),
      reviewedAt: requiredField(row.record, "reviewedAt"),
      reviewStatus: requiredField(row.record, "reviewStatus"),
    };
    const result = HumanGoldenCaseSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_CASE_ROW_INVALID",
        message: zodIssuesToMessage(result.error),
      });
      continue;
    }

    if (result.data.annotatedBy === result.data.reviewedBy) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_REVIEW_NOT_INDEPENDENT",
        message: `${result.data.caseId} must be reviewed by a different person.`,
      });
      continue;
    }
    if (Date.parse(result.data.reviewedAt) < Date.parse(result.data.annotatedAt)) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_REVIEW_BEFORE_ANNOTATION",
        message: `${result.data.caseId} was reviewed before annotation.`,
      });
      continue;
    }
    const relevanceChunkIds = result.data.relevantChunks.map((item) => item.chunkId);
    if (new Set(relevanceChunkIds).size !== relevanceChunkIds.length) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_RELEVANCE_DUPLICATE",
        message: `${result.data.caseId} has duplicate relevant chunk ids.`,
      });
      continue;
    }
    const unknownChunk = relevanceChunkIds.find((chunkId) => !chunkIds.has(chunkId));
    if (unknownChunk) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_RELEVANCE_CHUNK_UNKNOWN",
        message: `${result.data.caseId} references unknown chunk ${unknownChunk}.`,
      });
      continue;
    }
    if (!result.data.relevantChunks.some((item) => item.relevance >= 2)) {
      errors.push({
        fileName: "cases.tsv",
        rowNumber: row.rowNumber,
        code: "HUMAN_GOLDEN_NO_RELEVANT_CHUNK",
        message: `${result.data.caseId} requires at least one relevance >= 2 chunk.`,
      });
      continue;
    }

    cases.push({
      rowNumber: row.rowNumber,
      normalizedQuery: normalizeQuery(result.data.query),
      case: result.data,
    });
  }

  addDuplicateErrors(cases.map((row) => ({ rowNumber: row.rowNumber, value: row.case.caseId })), "cases.tsv", "caseId", errors);
  addDuplicateErrors(cases.map((row) => ({ rowNumber: row.rowNumber, value: row.normalizedQuery })), "cases.tsv", "normalized query", errors);
  return cases;
}

function validateMinimumCaseCount(minimumCaseCount: number) {
  if (!Number.isInteger(minimumCaseCount) || minimumCaseCount < 1) {
    throw new Error("HUMAN_GOLDEN_MINIMUM_CASE_COUNT_INVALID: minimum case count must be a positive integer");
  }
}

function validateRequiredDocumentTypes(requiredDocumentTypes: HumanGoldenDocumentType[]) {
  if (!requiredDocumentTypes.length) throw new Error("HUMAN_GOLDEN_REQUIRED_DOCUMENT_TYPES_REQUIRED");
  if (!requiredDocumentTypes.every((item) => HUMAN_GOLDEN_DOCUMENT_TYPES.includes(item))) {
    throw new Error("HUMAN_GOLDEN_REQUIRED_DOCUMENT_TYPE_INVALID");
  }
}

/**
 * 只检查人工标注包的进度和就绪度，不计算 Recall、MRR 或 NDCG，避免把未标注数据包装成质量指标。
 */
export function inspectHumanGoldenAnnotationPackage(input: InspectHumanGoldenAnnotationPackageInput): HumanGoldenAnnotationStatus {
  const minimumCaseCount = input.minimumCaseCount ?? 100;
  const requiredDocumentTypes = input.requiredDocumentTypes ?? DEFAULT_REQUIRED_DOCUMENT_TYPES;
  validateMinimumCaseCount(minimumCaseCount);
  validateRequiredDocumentTypes(requiredDocumentTypes);

  const errors: HumanGoldenAnnotationStatusError[] = [];
  const sourceRows = parseTsvForStatus(input.files["sources.tsv"], "sources.tsv");
  const chunkRows = parseTsvForStatus(input.files["chunks.tsv"], "chunks.tsv");
  const caseRows = parseTsvForStatus(input.files["cases.tsv"], "cases.tsv");
  errors.push(...sourceRows.errors, ...chunkRows.errors, ...caseRows.errors);

  const sources = parseSources(sourceRows.records, errors);
  const chunks = parseChunks(chunkRows.records, sources, errors);
  const cases = parseCases(caseRows.records, chunks, errors);
  const documentTypes = emptyDocumentTypes();
  for (const source of sources) documentTypes[source.source.documentType] += 1;

  const caseErrorRows = new Set(errors.filter((error) => error.fileName === "cases.tsv" && error.rowNumber).map((error) => error.rowNumber));
  const nonCaseErrors = errors.some((error) => error.fileName !== "cases.tsv");
  const invalidCaseCount = caseErrorRows.size;
  const validCaseCount = cases.length;
  const readinessIssues: string[] = [];

  if (caseRows.records.length === 0) readinessIssues.push("cases.tsv has no human-annotated query rows");
  if (validCaseCount < minimumCaseCount) {
    readinessIssues.push(`validCaseCount ${validCaseCount} is below the required minimum ${minimumCaseCount}`);
  }
  if (sources.length < 2) readinessIssues.push("at least two independently versioned source documents are required");
  for (const documentType of requiredDocumentTypes) {
    if (documentTypes[documentType] === 0) {
      readinessIssues.push(`at least one ${documentType} source document is required`);
    }
  }
  if (invalidCaseCount > 0) readinessIssues.push(`${invalidCaseCount} case row(s) must be fixed before build`);
  if (nonCaseErrors) readinessIssues.push("source and chunk snapshot rows must be fixed before annotation can be trusted");

  const eligibleForBuild = errors.length === 0 && validCaseCount > 0;
  const eligibleForRetrievalEvaluation = errors.length === 0 && readinessIssues.length === 0;
  const status = errors.length > 0 ? "invalid" : eligibleForRetrievalEvaluation ? "ready" : "not_ready";

  return {
    status,
    sourceCount: sources.length,
    chunkCount: chunks.length,
    caseRowCount: caseRows.records.length,
    validCaseCount,
    invalidCaseCount,
    minimumCaseCount,
    requiredDocumentTypes,
    documentTypes,
    eligibleForBuild,
    eligibleForRetrievalEvaluation,
    readinessIssues,
    errors,
    limitation: "This status report checks annotation progress and readiness only. It does not calculate Recall@5, MRR, NDCG, cost savings, or production RAG quality.",
  };
}
