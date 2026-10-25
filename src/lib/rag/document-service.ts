/**
 * 文档检索服务：RAG 数据访问层，封装知识块加载与检索，
 * 让上层路由不直接操作 Prisma 或检索算法；切换检索实现只改本文件。
 */
import { prisma } from "@/lib/db";
import { retrieveChunks, formatRetrievedChunks } from "@/lib/rag/retrieval";
import type { Chunk } from "@/lib/rag/chunker";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSION, embedText } from "@/lib/rag/embedding-client";
import { embeddingsEnabled } from "@/lib/rag/document-embeddings";
import { retrieveHybridChunks } from "@/lib/rag/hybrid-retrieval";
import type { EmbeddedChunk } from "@/lib/rag/embedding-retrieval";

export type DocumentCitation = {
  documentId: string;
  title: string;
  fileName: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceVersion: string;
  license: string;
  reviewedAt: string | null;
  checksumSha256: string;
  headingPath: string | null;
  startLine: number;
  endLine: number;
};

export type RetrievedDocumentChunk = {
  id: string;
  content: string;
  score: number;
  citation: DocumentCitation;
};

function parseChunkMetadata(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

/**
 * 从当前用户的知识库检索与 query 最相关的知识块（TF-IDF），格式化为带编号、
 * 分数与引用的文本供注入 Prompt；无匹配内容返回空字符串。
 */
export async function retrieveDocumentChunks(userId: string, query: string, limit: number = 5): Promise<string> {
  try {
    const results = await searchDocumentChunks(userId, query, limit);
    if (results.length === 0) return "";
    return formatRetrievedChunks(results.map((result) => ({
      id: result.id,
      documentId: result.citation.documentId,
      content: result.content,
      startLine: result.citation.startLine,
      endLine: result.citation.endLine,
      score: result.score,
      metadata: {
        documentTitle: result.citation.title,
        fileName: result.citation.fileName,
        headingPath: result.citation.headingPath ?? "",
        sourceUrl: result.citation.sourceUrl ?? "",
        sourceVersion: result.citation.sourceVersion,
        license: result.citation.license,
      },
    })));
  } catch (error) {
    // Agent上下文允许知识库不可用时降级；受控 Tool入口则直接调用 searchDocumentChunks并记录失败。
    console.error("Document retrieval failed:", error);
    return "";
  }
}

/** 返回带来源的结构化检索结果；调用方必须传入已认证用户 ID。 */
export async function searchDocumentChunks(userId: string, query: string, limit: number = 5): Promise<RetrievedDocumentChunk[]> {
    const chunks = await prisma.documentChunk.findMany({
      where: { document: { userId } },
      select: {
        id: true,
        documentId: true,
        content: true,
        startLine: true,
        endLine: true,
        metadata: true,
        embedding: { select: { model: true, dimension: true, vectorJson: true } },
        document: { select: { title: true, fileName: true, sourceType: true, sourceUrl: true, sourceVersion: true, license: true, reviewedAt: true, checksumSha256: true } },
      },
    });

    // 如果没有知识块，直接返回空字符串
    if (chunks.length === 0) return [];

    // 转换为检索模块需要的 Chunk 格式
    const mapped: Chunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      // 单条旧数据损坏时只忽略它的 metadata，不能让整次知识检索失效。
      metadata: {
        ...parseChunkMetadata(chunk.metadata),
        documentTitle: chunk.document.title,
        fileName: chunk.document.fileName,
        sourceType: chunk.document.sourceType,
        sourceUrl: chunk.document.sourceUrl ?? "",
        sourceVersion: chunk.document.sourceVersion,
        license: chunk.document.license,
        reviewedAt: chunk.document.reviewedAt?.toISOString() ?? "",
        checksumSha256: chunk.document.checksumSha256,
      },
    }));

    const results = await retrieveWithAvailableStrategy(query, mapped, chunks.map((chunk) => chunk.embedding), limit);
    return results.map((result) => {
      const source = chunks.find((chunk) => chunk.id === result.id)!;
      return {
        id: result.id,
        content: result.content,
        score: result.score,
        citation: {
          documentId: result.documentId,
          title: source.document.title,
          fileName: source.document.fileName,
          sourceType: source.document.sourceType,
          sourceUrl: source.document.sourceUrl,
          sourceVersion: source.document.sourceVersion,
          license: source.document.license,
          reviewedAt: source.document.reviewedAt?.toISOString() ?? null,
          checksumSha256: source.document.checksumSha256,
          headingPath: result.metadata.headingPath || null,
          startLine: result.startLine,
          endLine: result.endLine,
        },
      };
    });
}

function parseEmbedding(value: string, expectedDimension: number): number[] | null {
  try {
    const vector = JSON.parse(value);
    return Array.isArray(vector) && vector.length === expectedDimension && vector.every((item) => typeof item === "number" && Number.isFinite(item)) ? vector : null;
  } catch {
    return null;
  }
}

/**
 * Hybrid mode is opt-in and all-or-nothing for one user corpus.
 * 任何 chunk 缺少当前模型向量、Ollama 失败或向量损坏时都确定性回退到 TF-IDF，避免部分语料被静默忽略。
 */
export async function retrieveWithAvailableStrategy(
  query: string,
  chunks: Chunk[],
  embeddings: Array<{ model: string; dimension: number; vectorJson: string } | null>,
  limit: number,
  options: { enabled?: boolean; embedQuery?: (input: string) => Promise<number[]> } = {},
) {
  if (!(options.enabled ?? embeddingsEnabled()) || chunks.length !== embeddings.length) return retrieveChunks(query, chunks, limit);
  const model = process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL;
  const embedded: EmbeddedChunk[] = chunks.flatMap((chunk, index) => {
    const record = embeddings[index];
    const vector = record?.model === model && record.dimension === EMBEDDING_DIMENSION
      ? parseEmbedding(record.vectorJson, EMBEDDING_DIMENSION)
      : null;
    return vector ? [{ ...chunk, embedding: vector }] : [];
  });
  if (embedded.length !== chunks.length) return retrieveChunks(query, chunks, limit);
  try {
    return retrieveHybridChunks(query, await (options.embedQuery ?? embedText)(query), embedded, limit);
  } catch {
    return retrieveChunks(query, chunks, limit);
  }
}
