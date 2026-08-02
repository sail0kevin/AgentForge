import type { Chunk } from "./chunker";
import { retrieveChunks, type RetrievedChunk } from "./retrieval";

export type RetrievalFixture = { id: string; query: string; relevantChunkIds: string[] };
export type RetrievalMetrics = {
  recallAtK: number;
  meanReciprocalRank: number;
  ndcgAtK: number;
  irrelevantResultRate: number;
  citationCompleteness: number;
};

/** 可插拔检索器：给定 query/chunks/k 返回排好序的结果。默认用 TF-IDF；混合检索评测时传入自定义实现。 */
export type Retriever = (query: string, chunks: Chunk[], k: number) => RetrievedChunk[];

/** 固定查询集的轻量离线评测。默认用 TF-IDF；通过 retriever 参数可对比 embedding / hybrid 等其它检索路。 */
export function evaluateRetrieval(fixtures: RetrievalFixture[], chunks: Chunk[], k = 5, retriever: Retriever = retrieveChunks): RetrievalMetrics {
  if (fixtures.length === 0) return { recallAtK: 0, meanReciprocalRank: 0, ndcgAtK: 0, irrelevantResultRate: 0, citationCompleteness: 0 };
  let recall = 0;
  let reciprocalRank = 0;
  let normalizedDiscountedCumulativeGain = 0;
  let irrelevant = 0;
  let returned = 0;
  let completeCitations = 0;

  for (const fixture of fixtures) {
    const relevant = new Set(fixture.relevantChunkIds);
    const results = retriever(fixture.query, chunks, k);
    const relevantReturned = results.filter((result) => relevant.has(result.id));
    recall += relevantReturned.length / Math.max(relevant.size, 1);
    const firstRelevantIndex = results.findIndex((result) => relevant.has(result.id));
    reciprocalRank += firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
    // 当前 Golden Set 使用二元相关性标注；NDCG 用位置折损衡量相关证据是否被排在前面。
    const discountedCumulativeGain = results.reduce(
      (sum, result, index) => sum + (relevant.has(result.id) ? 1 / Math.log2(index + 2) : 0),
      0,
    );
    const idealResultCount = Math.min(relevant.size, k);
    const idealDiscountedCumulativeGain = Array.from({ length: idealResultCount }, (_, index) => 1 / Math.log2(index + 2))
      .reduce((sum, gain) => sum + gain, 0);
    normalizedDiscountedCumulativeGain += idealDiscountedCumulativeGain === 0 ? 0 : discountedCumulativeGain / idealDiscountedCumulativeGain;
    irrelevant += results.length - relevantReturned.length;
    returned += results.length;
    completeCitations += results.filter((result) =>
      Boolean(result.documentId && result.metadata.documentTitle && result.metadata.headingPath && result.metadata.sourceVersion && result.metadata.license)
      && result.startLine >= 0 && result.endLine >= result.startLine
    ).length;
  }

  return {
    recallAtK: recall / fixtures.length,
    meanReciprocalRank: reciprocalRank / fixtures.length,
    ndcgAtK: normalizedDiscountedCumulativeGain / fixtures.length,
    irrelevantResultRate: returned === 0 ? 0 : irrelevant / returned,
    citationCompleteness: returned === 0 ? 0 : completeCitations / returned,
  };
}
