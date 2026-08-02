/**
 * Hybrid RAG 对比评测：TF-IDF vs Embedding vs Hybrid(RRF)
 *
 * 在同一组固定夹具（resume-fixtures，12 个检索意图 + 噪声块）上，用真实 Ollama embedding
 * 计算三种检索路的 recall@k / MRR，输出真实对比数字，不编造。
 *
 * 需要本地 Ollama 在线且已 pull embedding 模型（默认 bge-m3）。Ollama 不可达时明确跳过并说明，
 * 而不是回退成假结果。
 */

import { evaluateRetrieval, type Retriever } from "../src/lib/rag/evaluation";
import { resumeFixtureChunks, resumeFixtures, resumeNoiseChunks } from "../src/lib/rag/resume-fixtures";
import { retrieveChunks, type RetrievedChunk } from "../src/lib/rag/retrieval";
import { retrieveByEmbedding, type EmbeddedChunk } from "../src/lib/rag/embedding-retrieval";
import { reciprocalRankFusion } from "../src/lib/rag/rrf";
import { embedTexts, DEFAULT_EMBEDDING_MODEL } from "../src/lib/rag/embedding-client";
import type { Chunk } from "../src/lib/rag/chunker";

async function ollamaReachable(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

// chunk 的可检索文本：与 retrieval.ts 的 searchableText 口径一致，让两路看到同样的语义输入。
function searchableText(chunk: Chunk): string {
  return [chunk.metadata.documentTitle, chunk.metadata.fileName, chunk.metadata.heading, chunk.metadata.headingPath, chunk.content]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  if (!(await ollamaReachable())) {
    console.log(JSON.stringify({
      comparison: "rag-hybrid",
      status: "skipped",
      reason: "Ollama not reachable at OLLAMA_BASE_URL; start Ollama and pull the embedding model before running the real comparison.",
    }, null, 2));
    return;
  }

  const allChunks = [...resumeFixtureChunks, ...resumeNoiseChunks];

  // 一次性预算所有 chunk 与 query 的向量，供同步 retriever 闭包查表。
  const chunkVectors = await embedTexts(allChunks.map(searchableText));
  const embeddingById = new Map<string, number[]>();
  allChunks.forEach((chunk, index) => embeddingById.set(chunk.id, chunkVectors[index]));

  const uniqueQueries = Array.from(new Set(resumeFixtures.map((fixture) => fixture.query)));
  const queryVectors = await embedTexts(uniqueQueries);
  const embeddingByQuery = new Map<string, number[]>();
  uniqueQueries.forEach((query, index) => embeddingByQuery.set(query, queryVectors[index]));

  // 把传入的 chunks 映射成带向量版本；缺向量的跳过（正常情况下不会缺）。
  const toEmbedded = (chunks: Chunk[]): EmbeddedChunk[] =>
    chunks.flatMap((chunk) => {
      const embedding = embeddingById.get(chunk.id);
      return embedding ? [{ ...chunk, embedding }] : [];
    });

  const embeddingRetriever: Retriever = (query, chunks, k) => {
    const queryEmbedding = embeddingByQuery.get(query);
    if (!queryEmbedding) return [];
    return retrieveByEmbedding(queryEmbedding, toEmbedded(chunks), k);
  };

  const hybridRetriever: Retriever = (query, chunks, k): RetrievedChunk[] => {
    const keyword = retrieveChunks(query, chunks, k);
    const semantic = embeddingRetriever(query, chunks, k);
    const fused = reciprocalRankFusion([keyword, semantic], { limit: k });
    // 去掉 rrfScore，把 RRF 名次分放进 score 字段，保持返回类型为 RetrievedChunk[]。
    return fused.map(({ rrfScore, ...rest }) => ({ ...rest, score: rrfScore }));
  };

  const k = 5;
  const scenarios = [
    { name: "clean", chunks: resumeFixtureChunks },
    { name: "sharedNoise", chunks: allChunks },
  ] as const;

  const results = scenarios.map((scenario) => ({
    scenario: scenario.name,
    chunkCount: scenario.chunks.length,
    tfidf: evaluateRetrieval(resumeFixtures, scenario.chunks, k, retrieveChunks),
    embedding: evaluateRetrieval(resumeFixtures, scenario.chunks, k, embeddingRetriever),
    hybrid: evaluateRetrieval(resumeFixtures, scenario.chunks, k, hybridRetriever),
  }));

  console.log(JSON.stringify({
    comparison: "rag-hybrid",
    status: "ok",
    model: process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL,
    fixtureCount: resumeFixtures.length,
    k,
    results,
    note: "Real recall@k / MRR on fixed resume fixtures using live Ollama embeddings. Deterministic fixtures measure fusion plumbing and relative behavior; scale the fixture set for a stronger claim.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
