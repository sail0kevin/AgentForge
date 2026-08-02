import { createHash } from "node:crypto";
import { z } from "zod";

export const HUMAN_RAG_GOLDEN_SET_SCHEMA_VERSION = 1;
export const HUMAN_GOLDEN_DOCUMENT_TYPES = ["technical", "business", "api-reference", "runbook", "policy", "other"] as const;
export type HumanGoldenDocumentType = (typeof HUMAN_GOLDEN_DOCUMENT_TYPES)[number];

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "must be a 64-character SHA-256 hex digest");

export const HumanGoldenSourceSchema = z.object({
  sourceId: z.string().regex(/^source-[a-z0-9][a-z0-9-]*$/),
  documentId: z.string().min(1),
  documentType: z.enum(HUMAN_GOLDEN_DOCUMENT_TYPES),
  version: z.string().min(1),
  contentSha256: Sha256Schema,
  license: z.string().min(1),
});

export const HumanGoldenChunkSchema = z.object({
  chunkId: z.string().min(1),
  sourceId: z.string().min(1),
  documentId: z.string().min(1),
  contentSha256: Sha256Schema,
});

export const HumanGoldenCaseSchema = z.object({
  caseId: z.string().regex(/^rag-case-[a-z0-9][a-z0-9-]*$/),
  query: z.string().min(3),
  queryType: z.enum(["exact-keyword", "semantic", "multi-hop", "comparison", "troubleshooting"]),
  relevantChunks: z.array(z.object({
    chunkId: z.string().min(1),
    // 三级相关性支持后续真实语料上的 graded NDCG，但当前工具不会计算检索指标。
    relevance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })).min(1),
  annotatedBy: z.string().min(1),
  annotatedAt: z.string().datetime({ offset: true }),
  reviewedBy: z.string().min(1),
  reviewedAt: z.string().datetime({ offset: true }),
  reviewStatus: z.literal("approved"),
});

export const HumanGoldenSetSchema = z.object({
  schemaVersion: z.literal(HUMAN_RAG_GOLDEN_SET_SCHEMA_VERSION),
  datasetId: z.string().regex(/^rag-human-golden-[a-z0-9][a-z0-9-]*$/),
  frozenAt: z.string().datetime({ offset: true }),
  sourceSnapshot: z.object({
    snapshotId: z.string().min(1),
    sha256: Sha256Schema,
  }),
  sources: z.array(HumanGoldenSourceSchema).min(1),
  chunks: z.array(HumanGoldenChunkSchema).min(1),
  cases: z.array(HumanGoldenCaseSchema).min(1),
});

export type HumanGoldenSet = z.infer<typeof HumanGoldenSetSchema>;

export type HumanGoldenSetQualityReport = {
  datasetId: string;
  datasetSha256: string;
  frozenAt: string;
  sourceSnapshot: HumanGoldenSet["sourceSnapshot"];
  sourceCount: number;
  chunkCount: number;
  caseCount: number;
  approvedCaseCount: number;
  documentTypes: Record<HumanGoldenSet["sources"][number]["documentType"], number>;
  queryTypes: Record<HumanGoldenSet["cases"][number]["queryType"], number>;
  relevanceLevels: Record<"1" | "2" | "3", number>;
  multiSourceCaseCount: number;
  limitation: string;
};

export type HumanGoldenSetReadinessReport = HumanGoldenSetQualityReport & {
  minimumCaseCount: number;
  requiredDocumentTypes: HumanGoldenDocumentType[];
  eligibleForRetrievalEvaluation: boolean;
  readinessIssues: string[];
};

const DEFAULT_REQUIRED_DOCUMENT_TYPES: HumanGoldenDocumentType[] = [
  "technical",
  "business",
  "api-reference",
];

function assertUnique(values: string[], errorCode: string) {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * 校验可用于真实 RAG 评测的人工标注输入契约。
 * 该函数只验证数据来源、标注和审核的完整性，不将 fixture 或合成数据伪装为人工语料。
 */
export function validateHumanGoldenSet(raw: unknown): HumanGoldenSet {
  const dataset = HumanGoldenSetSchema.parse(raw);
  assertUnique(dataset.sources.map((item) => item.sourceId), "HUMAN_GOLDEN_SOURCE_DUPLICATE: sourceId must be unique");
  assertUnique(dataset.sources.map((item) => item.documentId), "HUMAN_GOLDEN_DOCUMENT_DUPLICATE: documentId must be unique");
  assertUnique(dataset.chunks.map((item) => item.chunkId), "HUMAN_GOLDEN_CHUNK_DUPLICATE: chunkId must be unique");
  assertUnique(dataset.cases.map((item) => item.caseId), "HUMAN_GOLDEN_CASE_DUPLICATE: caseId must be unique");
  assertUnique(dataset.cases.map((item) => normalizeQuery(item.query)), "HUMAN_GOLDEN_QUERY_DUPLICATE: normalized query must be unique");

  const sources = new Map(dataset.sources.map((item) => [item.sourceId, item]));
  for (const chunk of dataset.chunks) {
    const source = sources.get(chunk.sourceId);
    if (!source) throw new Error(`HUMAN_GOLDEN_CHUNK_SOURCE_UNKNOWN: ${chunk.chunkId} references ${chunk.sourceId}`);
    if (source.documentId !== chunk.documentId) {
      throw new Error(`HUMAN_GOLDEN_CHUNK_DOCUMENT_MISMATCH: ${chunk.chunkId} does not belong to ${chunk.sourceId}`);
    }
  }

  const chunks = new Set(dataset.chunks.map((item) => item.chunkId));
  for (const testCase of dataset.cases) {
    if (testCase.annotatedBy === testCase.reviewedBy) {
      throw new Error(`HUMAN_GOLDEN_REVIEW_NOT_INDEPENDENT: ${testCase.caseId} must be reviewed by a different person`);
    }
    if (Date.parse(testCase.reviewedAt) < Date.parse(testCase.annotatedAt)) {
      throw new Error(`HUMAN_GOLDEN_REVIEW_BEFORE_ANNOTATION: ${testCase.caseId}`);
    }
    assertUnique(testCase.relevantChunks.map((item) => item.chunkId), `HUMAN_GOLDEN_RELEVANCE_DUPLICATE: ${testCase.caseId}`);
    for (const relevance of testCase.relevantChunks) {
      if (!chunks.has(relevance.chunkId)) {
        throw new Error(`HUMAN_GOLDEN_RELEVANCE_CHUNK_UNKNOWN: ${testCase.caseId} references ${relevance.chunkId}`);
      }
    }
    if (!testCase.relevantChunks.some((item) => item.relevance >= 2)) {
      throw new Error(`HUMAN_GOLDEN_NO_RELEVANT_CHUNK: ${testCase.caseId} requires at least one relevance >= 2 chunk`);
    }
  }
  return dataset;
}

export function hashHumanGoldenSet(dataset: HumanGoldenSet) {
  return createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
}

/** 仅汇总数据覆盖和审核状态，刻意不把这份报告表述为 Recall、MRR 或 NDCG。 */
export function summarizeHumanGoldenSet(dataset: HumanGoldenSet): HumanGoldenSetQualityReport {
  const documentTypes: HumanGoldenSetQualityReport["documentTypes"] = {
    technical: 0, business: 0, "api-reference": 0, runbook: 0, policy: 0, other: 0,
  };
  const queryTypes: HumanGoldenSetQualityReport["queryTypes"] = {
    "exact-keyword": 0, semantic: 0, "multi-hop": 0, comparison: 0, troubleshooting: 0,
  };
  const relevanceLevels: HumanGoldenSetQualityReport["relevanceLevels"] = { "1": 0, "2": 0, "3": 0 };
  const chunkSources = new Map(dataset.chunks.map((item) => [item.chunkId, item.sourceId]));
  let multiSourceCaseCount = 0;

  for (const source of dataset.sources) documentTypes[source.documentType] += 1;
  for (const testCase of dataset.cases) {
    queryTypes[testCase.queryType] += 1;
    const relatedSources = new Set<string>();
    for (const relevance of testCase.relevantChunks) {
      relevanceLevels[String(relevance.relevance) as "1" | "2" | "3"] += 1;
      relatedSources.add(chunkSources.get(relevance.chunkId)!);
    }
    if (relatedSources.size > 1) multiSourceCaseCount += 1;
  }

  return {
    datasetId: dataset.datasetId,
    datasetSha256: hashHumanGoldenSet(dataset),
    frozenAt: dataset.frozenAt,
    sourceSnapshot: dataset.sourceSnapshot,
    sourceCount: dataset.sources.length,
    chunkCount: dataset.chunks.length,
    caseCount: dataset.cases.length,
    approvedCaseCount: dataset.cases.length,
    documentTypes,
    queryTypes,
    relevanceLevels,
    multiSourceCaseCount,
    limitation: "This report verifies labelled-data completeness and provenance only. It does not calculate retrieval quality or support a production RAG quality claim.",
  };
}

/**
 * 判断冻结人工标注集是否达到真实检索对比的最低样本边界。
 * 这是数据集就绪性检查，不计算也不推断任何检索质量指标。
 */
export function assessHumanGoldenSetReadiness(
  dataset: HumanGoldenSet,
  minimumCaseCount = 100,
  requiredDocumentTypes = DEFAULT_REQUIRED_DOCUMENT_TYPES,
): HumanGoldenSetReadinessReport {
  if (!Number.isInteger(minimumCaseCount) || minimumCaseCount < 1) {
    throw new Error("HUMAN_GOLDEN_MINIMUM_CASE_COUNT_INVALID: minimum case count must be a positive integer");
  }

  const summary = summarizeHumanGoldenSet(dataset);
  const readinessIssues: string[] = [];
  if (summary.caseCount < minimumCaseCount) {
    readinessIssues.push(`caseCount ${summary.caseCount} is below the required minimum ${minimumCaseCount}`);
  }
  if (summary.sourceCount < 2) {
    readinessIssues.push("at least two independently versioned source documents are required");
  }
  for (const documentType of requiredDocumentTypes) {
    if (summary.documentTypes[documentType] === 0) {
      readinessIssues.push(`at least one ${documentType} source document is required`);
    }
  }

  return {
    ...summary,
    minimumCaseCount,
    requiredDocumentTypes,
    eligibleForRetrievalEvaluation: readinessIssues.length === 0,
    readinessIssues,
  };
}
