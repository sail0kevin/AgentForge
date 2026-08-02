import { createHash } from "node:crypto";
import type { Chunk } from "./chunker";
import { HUMAN_GOLDEN_DOCUMENT_TYPES, type HumanGoldenDocumentType } from "./human-golden-set";

export type HumanGoldenSourceManifestEntry = {
  sourceId: string;
  documentId: string;
  documentType: HumanGoldenDocumentType;
  version: string;
  contentSha256: string;
  license: string;
};

export type HumanGoldenAnnotationPackage = {
  "sources.tsv": string;
  "chunks.tsv": string;
  "cases.tsv": string;
  "README.md": string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertSha256(value: string, field: string) {
  if (!SHA256_PATTERN.test(value)) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_SHA256_INVALID: ${field}`);
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_DUPLICATE: ${field}`);
}

function assertNoTabsOrNewlines(value: string, field: string) {
  if (/[	\r\n]/.test(value)) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_TSV_VALUE_INVALID: ${field}`);
}

function validateSourceManifest(entries: HumanGoldenSourceManifestEntry[]) {
  if (!entries.length) throw new Error("RAG_HUMAN_GOLDEN_PACKAGE_SOURCES_EMPTY");
  assertUnique(entries.map((entry) => entry.sourceId), "sourceId");
  assertUnique(entries.map((entry) => entry.documentId), "documentId");
  for (const entry of entries) {
    if (!/^source-[a-z0-9][a-z0-9-]*$/.test(entry.sourceId)) {
      throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_SOURCE_ID_INVALID: ${entry.sourceId}`);
    }
    if (!entry.documentId || !entry.version || !entry.license) {
      throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_SOURCE_FIELD_MISSING: ${entry.sourceId}`);
    }
    if (!HUMAN_GOLDEN_DOCUMENT_TYPES.includes(entry.documentType)) {
      throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_DOCUMENT_TYPE_INVALID: ${entry.documentId}`);
    }
    assertSha256(entry.contentSha256, `source:${entry.documentId}`);
    for (const [field, value] of Object.entries(entry)) assertNoTabsOrNewlines(String(value), `${entry.sourceId}:${field}`);
  }
}

function validateCorpus(chunks: Chunk[], sources: HumanGoldenSourceManifestEntry[]) {
  if (!chunks.length) throw new Error("RAG_HUMAN_GOLDEN_PACKAGE_CORPUS_EMPTY");
  const sourceByDocumentId = new Map(sources.map((source) => [source.documentId, source]));
  assertUnique(chunks.map((chunk) => chunk.id), "chunkId");
  for (const chunk of chunks) {
    const source = sourceByDocumentId.get(chunk.documentId);
    if (!source) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_CHUNK_SOURCE_UNKNOWN: ${chunk.id}`);
    if (!chunk.content.trim()) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_CHUNK_CONTENT_EMPTY: ${chunk.id}`);
    if (!Number.isInteger(chunk.startLine) || !Number.isInteger(chunk.endLine) || chunk.endLine < chunk.startLine) {
      throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_CHUNK_LINES_INVALID: ${chunk.id}`);
    }
  }
}

function tsvRow(values: string[]) {
  return `${values.join("\t")}\n`;
}

/** 从冻结语料自动生成可追溯的来源/Chunk 清单；不生成任何人工 query 或相关性判断。 */
export function buildHumanGoldenAnnotationPackage(
  chunks: Chunk[],
  sources: HumanGoldenSourceManifestEntry[],
): HumanGoldenAnnotationPackage {
  validateSourceManifest(sources);
  validateCorpus(chunks, sources);

  const sourcesTsv = [
    tsvRow(["sourceId", "documentId", "documentType", "version", "contentSha256", "license"]),
    ...sources.map((source) => tsvRow([source.sourceId, source.documentId, source.documentType, source.version, source.contentSha256, source.license])),
  ].join("");
  const chunksTsv = [
    tsvRow(["chunkId", "sourceId", "documentId", "contentSha256"]),
    ...chunks.map((chunk) => tsvRow([chunk.id, sourceForChunk(chunk, sources).sourceId, chunk.documentId, sha256(chunk.content)])),
  ].join("");
  const casesTsv = tsvRow(["caseId", "query", "queryType", "relevantChunksJson", "annotatedBy", "annotatedAt", "reviewedBy", "reviewedAt", "reviewStatus"]);
  const sourceSnapshotSha256 = sha256(`${sourcesTsv}${chunksTsv}`);

  return {
    "sources.tsv": sourcesTsv,
    "chunks.tsv": chunksTsv,
    "cases.tsv": casesTsv,
    "README.md": [
      "# RAG human Golden Set annotation package",
      "",
      "This package was generated from a frozen corpus. The source and chunk rows are evidence-derived; do not edit their identifiers or hashes.",
      "",
      `Source/chunk snapshot SHA-256: ${sourceSnapshotSha256}`,
      `Source count: ${sources.length}`,
      `Chunk count: ${chunks.length}`,
      "",
      "Annotators fill only cases.tsv. Each case needs a human-written query, queryType, relevantChunksJson with relevance 1/2/3, and annotation metadata.",
      "A different reviewer must approve each case. Do not use model-generated queries or labels as human evidence.",
      "",
    ].join("\n"),
  };
}

function sourceForChunk(chunk: Chunk, sources: HumanGoldenSourceManifestEntry[]) {
  const source = sources.find((entry) => entry.documentId === chunk.documentId);
  if (!source) throw new Error(`RAG_HUMAN_GOLDEN_PACKAGE_CHUNK_SOURCE_UNKNOWN: ${chunk.id}`);
  return source;
}
