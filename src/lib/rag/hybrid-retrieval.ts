import type { Chunk } from "./chunker";
import { retrieveByEmbedding, type EmbeddedChunk } from "./embedding-retrieval";
import { reciprocalRankFusion } from "./rrf";
import { retrieveChunks, type RetrievedChunk } from "./retrieval";

/** Keeps keyword and embedding retrieval on the same document representation. */
export function searchableChunkText(chunk: Chunk): string {
  return [chunk.metadata.documentTitle, chunk.metadata.fileName, chunk.metadata.heading, chunk.metadata.headingPath, chunk.content]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fuse keyword and semantic rankings without comparing their incompatible raw scores.
 * 向量不完整时不应调用本函数；调用方必须明确降级到 TF-IDF，避免静默混用不同模型的向量。
 */
export function retrieveHybridChunks(
  query: string,
  queryEmbedding: number[],
  chunks: EmbeddedChunk[],
  limit = 5,
): RetrievedChunk[] {
  const keyword = retrieveChunks(query, chunks, limit);
  const semantic = retrieveByEmbedding(queryEmbedding, chunks, limit);
  return reciprocalRankFusion([keyword, semantic], { limit })
    .map(({ rrfScore, ...chunk }) => ({ ...chunk, score: rrfScore }));
}
