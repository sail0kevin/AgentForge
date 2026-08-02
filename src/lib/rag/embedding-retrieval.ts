/**
 * Embedding（向量）检索
 *
 * 作用：混合检索的"语义召回"这一路。用 embedding 把 query 和 chunk 都转成向量，
 *       按余弦相似度排序，返回与 TF-IDF 检索同构的 RetrievedChunk[]，
 *       这样两路结果能直接喂给 RRF 融合。
 *
 * 原理：余弦相似度 = 两向量点积 / (各自模长之积)，衡量方向一致程度，值域 [-1, 1]。
 *       向量已归一化时可省去模长，但这里不假设归一化，显式计算更稳妥。
 *
 * 设计取舍：chunk 的向量由调用方预先算好传入（EmbeddedChunk.embedding），
 *       本模块不负责调 Ollama，只做纯计算，方便测试和复用（既能用预存向量，也能用即时向量）。
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
