/**
 * Embedding（向量）检索：混合检索的语义召回一路。按余弦相似度排序，
 * 返回与 TF-IDF 检索同构的 RetrievedChunk[]，两路结果可直接喂给 RRF 融合。
 * 不假设向量已归一化，显式计算模长；chunk 向量由调用方预先算好传入，
 * 本模块是纯计算，不调 Ollama，便于测试与复用。
 */

import type { Chunk } from "./chunker";
import type { RetrievedChunk } from "./retrieval";

/** 带向量的 chunk：在原 Chunk 基础上附加预先算好的 embedding。 */
export type EmbeddedChunk = Chunk & { embedding: number[] };

/** 计算两个等长向量的余弦相似度；长度不等或零向量返回 0。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 用预先算好的 query 向量，对一组带向量的 chunk 做余弦相似度检索。
 *
 * @param queryEmbedding 已算好的查询向量
 * @param chunks 带 embedding 的候选 chunk
 * @param limit 返回条数上限
 * @returns 按相似度降序的 RetrievedChunk[]（score 即余弦相似度），与 TF-IDF 检索类型一致
 */
export function retrieveByEmbedding(queryEmbedding: number[], chunks: EmbeddedChunk[], limit = 5): RetrievedChunk[] {
  if (queryEmbedding.length === 0 || chunks.length === 0) return [];

  const scored = chunks.map((chunk) => {
    // 复制出不含 embedding 的部分，保持 RetrievedChunk 结构与 TF-IDF 路一致。
    const { embedding, ...rest } = chunk;
    void embedding;
    return { ...rest, score: cosineSimilarity(queryEmbedding, chunk.embedding) };
  });

  return scored
    .filter((chunk) => chunk.score > 0)
    // 相同分数时用与 TF-IDF 路一致的确定性 tie-break，保证融合前排名可复现。
    .sort((a, b) => b.score - a.score || a.documentId.localeCompare(b.documentId) || a.startLine - b.startLine || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
