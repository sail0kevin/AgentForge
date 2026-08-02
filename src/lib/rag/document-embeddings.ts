import { prisma } from "@/lib/db";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION, embedTexts } from "./embedding-client";
import { searchableChunkText } from "./hybrid-retrieval";
import type { Chunk } from "./chunker";

export type PersistedDocumentChunk = Chunk & { id: string };
export type DocumentEmbeddingStatus = "disabled" | "ready" | "unavailable";
export type StoredEmbedding = { model: string; dimension: number; vectorJson: string } | null;

export function embeddingsEnabled() {
  return process.env.RAG_EMBEDDINGS_ENABLED === "true";
}

function hasCurrentEmbedding(embedding: StoredEmbedding, model: string) {
  if (!embedding || embedding.model !== model || embedding.dimension !== EMBEDDING_DIMENSION) return false;
  try {
    const vector = JSON.parse(embedding.vectorJson);
    return Array.isArray(vector)
      && vector.length === EMBEDDING_DIMENSION
      && vector.every((item) => typeof item === "number" && Number.isFinite(item));
  } catch {
    return false;
  }
}

/**
 * Select only missing, stale, or malformed vectors for an explicit maintenance backfill.
 * 这是一条纯规则，确保回填不会重算已经符合当前模型契约的向量。
 */
export function selectChunksNeedingEmbeddings<T extends PersistedDocumentChunk & { embedding: StoredEmbedding }>(
  chunks: T[],
  model = process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL,
) {
  return chunks.filter((chunk) => !hasCurrentEmbedding(chunk.embedding, model));
}

/**
 * Persist vectors only after Document/DocumentChunk has committed successfully.
 * 上传文档的主事务绝不依赖本地 embedding 服务，避免 Ollama 不可用时丢失用户的原始知识。
 */
export async function persistDocumentEmbeddings(chunks: PersistedDocumentChunk[]): Promise<DocumentEmbeddingStatus> {
  if (!embeddingsEnabled()) return "disabled";
  try {
    const vectors = await embedTexts(chunks.map(searchableChunkText));
    await prisma.$transaction(chunks.map((chunk, index) => prisma.documentChunkEmbedding.upsert({
      where: { chunkId: chunk.id },
      create: {
        chunkId: chunk.id,
        model: process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL,
        dimension: EMBEDDING_DIMENSION,
        vectorJson: JSON.stringify(vectors[index]),
      },
      update: {
        model: process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL,
        dimension: EMBEDDING_DIMENSION,
        vectorJson: JSON.stringify(vectors[index]),
      },
    })));
    return "ready";
  } catch {
    // 向量服务是可选增强；失败时由检索路径使用 TF-IDF，不让上传接口伪造成功的混合检索状态。
    return "unavailable";
  }
}
