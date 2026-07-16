/**
 * 文档检索服务
 *
 * 在整个框架里扮演"RAG 数据访问层"的角色：封装从数据库加载知识块和检索的相关逻辑，
 * 让上层（manual/run 路由）不需要直接操作 Prisma 或检索算法。
 *
 * 为什么单独拆成一个文件：
 *   1. 复用性——未来其他路由（如 demo run、正式 workspace run）也需要同样的检索逻辑
 *   2. 可测试性——可以单独Mock 这个模块来测试上层逻辑
 *   3. 可升级性——后续切换到向量检索时，只需修改这一个文件
 */
import { prisma } from "@/lib/db";
import { retrieveChunks, formatRetrievedChunks } from "@/lib/rag/retrieval";
import type { Chunk } from "@/lib/rag/chunker";

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
 * 从知识库检索与查询相关的知识块，并格式化为可注入到 Prompt 的文本
 *
 * 作用：根据用户问题，从已上传文档中找出最相关的内容
 * 原理：
 *   1. 获取当前用户的 ID
 *   2. 从 Prisma 加载该用户的所有知识块（DocumentChunk）
 *   3. 用 TF-IDF 算法计算相关度，取前 limit 个
 *   4. 格式化为带编号和分数的文本，方便模型理解
 * 参数与返回值：
 *   - query: 用户输入的问题
 *   - limit: 返回的最大知识块数量（默认 5）
 *   - 返回：格式化后的文本，如果没有匹配内容则返回空字符串
 * 如何调用：
 *   const knowledge = await retrieveDocumentChunks('什么是RAG', 3);
 *   if (knowledge) { prompt += knowledge; }
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

    // 用 TF-IDF 检索最相关的知识块
    return retrieveChunks(query, mapped, limit).map((result) => {
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
