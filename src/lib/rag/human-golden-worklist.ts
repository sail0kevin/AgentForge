import { createHash } from "node:crypto";
import type { Chunk } from "./chunker";
import type { HumanGoldenSourceManifestEntry } from "./human-golden-package";
import {
  HUMAN_GOLDEN_DOCUMENT_TYPES,
  type HumanGoldenDocumentType,
} from "./human-golden-set";

export type HumanGoldenWorklistOptions = {
  targetCaseCount?: number;
  seed?: number;
  previewLength?: number;
  requiredDocumentTypes?: HumanGoldenDocumentType[];
};

export type HumanGoldenWorklistPackage = {
  "annotation-worklist.tsv": string;
  "README.md": string;
  "summary.json": string;
};

type Candidate = {
  chunk: Chunk;
  source: HumanGoldenSourceManifestEntry;
};

const DEFAULT_TARGET_CASE_COUNT = 100;
const DEFAULT_SEED = 20260802;
const DEFAULT_PREVIEW_LENGTH = 360;
const DEFAULT_REQUIRED_DOCUMENT_TYPES: HumanGoldenDocumentType[] = [
  "technical",
  "business",
  "api-reference",
];

const QUERY_TYPE_HINTS: Record<HumanGoldenDocumentType, string[]> = {
  technical: ["troubleshooting", "semantic", "multi-hop"],
  business: ["comparison", "semantic", "exact-keyword"],
  "api-reference": ["exact-keyword", "troubleshooting", "semantic"],
  runbook: ["troubleshooting", "exact-keyword", "semantic"],
  policy: ["exact-keyword", "comparison", "semantic"],
  other: ["semantic", "exact-keyword", "multi-hop"],
};

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_NUMBER_INVALID: ${field}`);
  }
}

function assertInteger(value: number, field: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_NUMBER_INVALID: ${field}`);
  }
}

function assertUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_DUPLICATE: ${field}`);
  }
}

function stableRank(seed: number, key: string) {
  return createHash("sha256").update(`${seed}:${key}`).digest("hex");
}

function cleanTsvValue(value: string) {
  return value.replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function previewContent(content: string, previewLength: number) {
  const preview = cleanTsvValue(content);
  if (preview.length <= previewLength) return preview;
  return `${preview.slice(0, Math.max(0, previewLength - 3)).trimEnd()}...`;
}

function tsvRow(values: string[]) {
  return `${values.map(cleanTsvValue).join("\t")}\n`;
}

function validateSources(sources: HumanGoldenSourceManifestEntry[]) {
  if (!sources.length) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_SOURCES_EMPTY");
  assertUnique(sources.map((source) => source.sourceId), "sourceId");
  assertUnique(sources.map((source) => source.documentId), "documentId");
  for (const source of sources) {
    if (!HUMAN_GOLDEN_DOCUMENT_TYPES.includes(source.documentType)) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_DOCUMENT_TYPE_INVALID: ${source.documentId}`);
    }
  }
}

function buildCandidates(chunks: Chunk[], sources: HumanGoldenSourceManifestEntry[]) {
  if (!chunks.length) throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_CORPUS_EMPTY");
  validateSources(sources);
  assertUnique(chunks.map((chunk) => chunk.id), "chunkId");

  const sourceByDocumentId = new Map(sources.map((source) => [source.documentId, source]));
  return chunks.map((chunk): Candidate => {
    const source = sourceByDocumentId.get(chunk.documentId);
    if (!source) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_CHUNK_SOURCE_UNKNOWN: ${chunk.id}`);
    if (!chunk.content.trim()) throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_CHUNK_CONTENT_EMPTY: ${chunk.id}`);
    if (!Number.isInteger(chunk.startLine) || !Number.isInteger(chunk.endLine) || chunk.endLine < chunk.startLine) {
      throw new Error(`RAG_HUMAN_GOLDEN_WORKLIST_CHUNK_LINES_INVALID: ${chunk.id}`);
    }
    return { chunk, source };
  });
}

function sortCandidates(candidates: Candidate[], seed: number, salt: string) {
  return [...candidates].sort((left, right) => {
    const leftRank = stableRank(seed, `${salt}:${left.source.sourceId}:${left.chunk.id}`);
    const rightRank = stableRank(seed, `${salt}:${right.source.sourceId}:${right.chunk.id}`);
    return leftRank.localeCompare(rightRank)
      || left.source.sourceId.localeCompare(right.source.sourceId)
      || left.chunk.id.localeCompare(right.chunk.id);
  });
}

function selectCandidates(
  candidates: Candidate[],
  targetCaseCount: number,
  seed: number,
  requiredDocumentTypes: HumanGoldenDocumentType[],
) {
  const selected: Candidate[] = [];
  const selectedChunkIds = new Set<string>();
  const taskCount = Math.min(targetCaseCount, candidates.length);

  // 先覆盖必须文档类型，避免随机抽样刚好漏掉 API、技术或业务材料。
  for (const documentType of requiredDocumentTypes) {
    if (selected.length >= taskCount) break;
    const requiredCandidate = sortCandidates(
      candidates.filter((candidate) => candidate.source.documentType === documentType),
      seed,
      `required:${documentType}`,
    ).find((candidate) => !selectedChunkIds.has(candidate.chunk.id));
    if (!requiredCandidate) continue;
    selected.push(requiredCandidate);
    selectedChunkIds.add(requiredCandidate.chunk.id);
  }

  const documentTypeOrder = [
    ...requiredDocumentTypes,
    ...HUMAN_GOLDEN_DOCUMENT_TYPES.filter((type) => !requiredDocumentTypes.includes(type)),
  ].filter((type, index, allTypes) => allTypes.indexOf(type) === index);
  const groups = documentTypeOrder.map((documentType) => ({
    documentType,
    items: sortCandidates(
      candidates.filter((candidate) => candidate.source.documentType === documentType),
      seed,
      `fill:${documentType}`,
    ),
    index: 0,
  }));

  while (selected.length < taskCount) {
    let addedThisPass = false;
    for (const group of groups) {
      while (group.index < group.items.length && selectedChunkIds.has(group.items[group.index].chunk.id)) {
        group.index += 1;
      }
      if (group.index >= group.items.length) continue;
      const candidate = group.items[group.index];
      group.index += 1;
      selected.push(candidate);
      selectedChunkIds.add(candidate.chunk.id);
      addedThisPass = true;
      if (selected.length >= taskCount) break;
    }
    if (!addedThisPass) break;
  }

  return selected;
}

function emptyDocumentTypeCounts() {
  return HUMAN_GOLDEN_DOCUMENT_TYPES.reduce((counts, documentType) => {
    counts[documentType] = 0;
    return counts;
  }, {} as Record<HumanGoldenDocumentType, number>);
}

export function buildHumanGoldenAnnotationWorklist(
  chunks: Chunk[],
  sources: HumanGoldenSourceManifestEntry[],
  options: HumanGoldenWorklistOptions = {},
): HumanGoldenWorklistPackage {
  const targetCaseCount = options.targetCaseCount ?? DEFAULT_TARGET_CASE_COUNT;
  const seed = options.seed ?? DEFAULT_SEED;
  const previewLength = options.previewLength ?? DEFAULT_PREVIEW_LENGTH;
  const requiredDocumentTypes = options.requiredDocumentTypes ?? DEFAULT_REQUIRED_DOCUMENT_TYPES;
  assertPositiveInteger(targetCaseCount, "targetCaseCount");
  assertInteger(seed, "seed");
  assertPositiveInteger(previewLength, "previewLength");
  if (!requiredDocumentTypes.every((type) => HUMAN_GOLDEN_DOCUMENT_TYPES.includes(type))) {
    throw new Error("RAG_HUMAN_GOLDEN_WORKLIST_REQUIRED_DOCUMENT_TYPE_INVALID");
  }

  const candidates = buildCandidates(chunks, sources);
  const selected = selectCandidates(candidates, targetCaseCount, seed, requiredDocumentTypes);
  const documentTypes = emptyDocumentTypeCounts();
  for (const candidate of selected) documentTypes[candidate.source.documentType] += 1;

  const worklistTsv = [
    tsvRow([
      "taskId",
      "documentType",
      "sourceId",
      "documentId",
      "chunkId",
      "startLine",
      "endLine",
      "queryTypeHints",
      "chunkPreview",
      "caseId",
      "humanQuery",
      "queryType",
      "relevantChunksJson",
      "annotatedBy",
      "annotatedAt",
      "reviewedBy",
      "reviewedAt",
      "reviewStatus",
      "notes",
    ]),
    ...selected.map((candidate, index) => tsvRow([
      `rag-worklist-${String(index + 1).padStart(4, "0")}`,
      candidate.source.documentType,
      candidate.source.sourceId,
      candidate.source.documentId,
      candidate.chunk.id,
      String(candidate.chunk.startLine),
      String(candidate.chunk.endLine),
      QUERY_TYPE_HINTS[candidate.source.documentType].join(","),
      previewContent(candidate.chunk.content, previewLength),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])),
  ].join("");
  const summary = {
    status: "worklist_generated",
    targetCaseCount,
    taskCount: selected.length,
    seed,
    sourceCount: sources.length,
    chunkCount: chunks.length,
    documentTypes,
    requiredDocumentTypes,
    coveredRequiredDocumentTypes: requiredDocumentTypes.filter((type) => documentTypes[type] > 0),
    generatedCaseRows: false,
    limitation: "This worklist queues human annotation tasks only. It does not create approved Golden Set cases or calculate Recall@5, MRR, or NDCG.",
  };

  return {
    "annotation-worklist.tsv": worklistTsv,
    "summary.json": `${JSON.stringify(summary, null, 2)}\n`,
    "README.md": [
      "# RAG human Golden Set annotation worklist",
      "",
      "This output is a task queue, not a Golden Set.",
      "It is generated from the frozen corpus to help humans choose queries and relevance labels without fabricating evaluation data.",
      "",
      `Target case count: ${targetCaseCount}`,
      `Generated task count: ${selected.length}`,
      `Seed: ${seed}`,
      "",
      "## Files",
      "",
      "- `annotation-worklist.tsv`: chunk-level tasks for human annotators.",
      "- `summary.json`: reproducible task count and document-type coverage summary.",
      "",
      "## Annotation rules",
      "",
      "1. Human annotators must write `humanQuery` themselves.",
      "2. Humans may optionally assign `caseId`; leaving it blank lets the converter derive it from `taskId`.",
      "3. Humans must choose `queryType`; query type hints are suggestions only.",
      "4. Humans must fill `relevantChunksJson`; include the selected `chunkId` and any other relevant chunks from `chunks.tsv`.",
      "5. A different reviewer must set `reviewStatus=approved` before the row can be converted into `cases.tsv`.",
      "6. Convert approved worklist rows with `quality:rag:human-golden:worklist-to-cases`, then run `quality:rag:human-golden:status` and `quality:rag:human-golden:build`.",
      "",
      "## Limitation",
      "",
      "This worklist does not calculate Recall@5, MRR, NDCG, latency, cost, or production RAG quality. It only starts the human-labeled data collection workflow.",
      "",
    ].join("\n"),
  };
}
