import { createHash } from "node:crypto";
import type { Chunk } from "./chunker";
import type { RetrievedChunk } from "./retrieval";

export type GradedRelevance = { chunkId: string; relevance: 1 | 2 | 3 };
export type GradedRetrievalFixture = { id: string; query: string; relevantChunks: GradedRelevance[] };

export type GradedRetrievalMetrics = {
  recallAtK: number;
  meanReciprocalRank: number;
  ndcgAtK: number;
  irrelevantResultRate: number;
  citationCompleteness: number;
};

export type GradedRetriever = (query: string, chunks: Chunk[], k: number) => RetrievedChunk[];

/**
 * 在人工标注的 1/2/3 分级相关性上计算统一指标。
 * 这里把 relevance >= 2 定义为“可用于回答的相关证据”；relevance = 1 只作为弱相关标签，
 * 不计入 Recall/MRR，也不把检索到它误报成有效证据。NDCG 使用 2^relevance - 1 增益。
 */
export function evaluateGradedRetrieval(
  fixtures: GradedRetrievalFixture[],
  chunks: Chunk[],
  k: number,
  retriever: GradedRetriever,
): GradedRetrievalMetrics {
  if (!Number.isInteger(k) || k < 1) throw new Error("RAG_GRADED_EVALUATION_K_INVALID: k must be a positive integer");
  if (fixtures.length === 0) return { recallAtK: 0, meanReciprocalRank: 0, ndcgAtK: 0, irrelevantResultRate: 0, citationCompleteness: 0 };

  let recall = 0;
  let reciprocalRank = 0;
  let ndcg = 0;
  let irrelevant = 0;
  let returned = 0;
  let completeCitations = 0;

  for (const fixture of fixtures) {
    const relevanceById = new Map(fixture.relevantChunks.map((item) => [item.chunkId, item.relevance]));
    const answerableCount = [...relevanceById.values()].filter((relevance) => relevance >= 2).length;
    const results = retriever(fixture.query, chunks, k);
    const answerableReturned = results.filter((result) => (relevanceById.get(result.id) ?? 0) >= 2);
    recall += answerableReturned.length / Math.max(answerableCount, 1);
    const firstRelevantIndex = results.findIndex((result) => (relevanceById.get(result.id) ?? 0) >= 2);
    reciprocalRank += firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);

    const discountedGain = results.reduce((sum, result, index) => {
      const relevance = relevanceById.get(result.id) ?? 0;
      return sum + (relevance > 0 ? (2 ** relevance - 1) / Math.log2(index + 2) : 0);
    }, 0);
    const idealRelevances = [...relevanceById.values()].sort((a, b) => b - a).slice(0, k);
    const idealGain = idealRelevances.reduce((sum, relevance, index) => sum + (2 ** relevance - 1) / Math.log2(index + 2), 0);
    ndcg += idealGain === 0 ? 0 : discountedGain / idealGain;

    irrelevant += results.filter((result) => (relevanceById.get(result.id) ?? 0) < 2).length;
    returned += results.length;
    completeCitations += results.filter((result) =>
      Boolean(result.documentId && result.metadata.documentTitle && result.metadata.headingPath && result.metadata.sourceVersion && result.metadata.license)
      && result.startLine >= 0 && result.endLine >= result.startLine,
    ).length;
  }

  return {
    recallAtK: recall / fixtures.length,
    meanReciprocalRank: reciprocalRank / fixtures.length,
    ndcgAtK: ndcg / fixtures.length,
    irrelevantResultRate: returned === 0 ? 0 : irrelevant / returned,
    citationCompleteness: returned === 0 ? 0 : completeCitations / returned,
  };
}

/** 计算参与评测的正文语料哈希，防止结果脱离实际快照后仍被复用。 */
export function hashRetrievalCorpus(chunks: Chunk[]) {
  const canonical = chunks.map((chunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    content: chunk.content,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    metadata: Object.fromEntries(Object.entries(chunk.metadata).sort(([a], [b]) => a.localeCompare(b))),
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
