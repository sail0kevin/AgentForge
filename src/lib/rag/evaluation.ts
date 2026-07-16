import type { Chunk } from "./chunker";
import { retrieveChunks } from "./retrieval";

export type RetrievalFixture = { id: string; query: string; relevantChunkIds: string[] };
export type RetrievalMetrics = { recallAtK: number; meanReciprocalRank: number; irrelevantResultRate: number; citationCompleteness: number };

/** 固定查询集的轻量离线评测；指标不足时再考虑 embedding，而不是先增加基础设施。 */
export function evaluateRetrieval(fixtures: RetrievalFixture[], chunks: Chunk[], k = 5): RetrievalMetrics {
  if (fixtures.length === 0) return { recallAtK: 0, meanReciprocalRank: 0, irrelevantResultRate: 0, citationCompleteness: 0 };
  let recall = 0;
  let reciprocalRank = 0;
  let irrelevant = 0;
  let returned = 0;
  let completeCitations = 0;

  for (const fixture of fixtures) {
    const relevant = new Set(fixture.relevantChunkIds);
    const results = retrieveChunks(fixture.query, chunks, k);
    const relevantReturned = results.filter((result) => relevant.has(result.id));
    recall += relevantReturned.length / Math.max(relevant.size, 1);
    const firstRelevantIndex = results.findIndex((result) => relevant.has(result.id));
    reciprocalRank += firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
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
    irrelevantResultRate: returned === 0 ? 0 : irrelevant / returned,
    citationCompleteness: returned === 0 ? 0 : completeCitations / returned,
  };
}
