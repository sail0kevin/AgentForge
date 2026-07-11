/**
 * 知识库检索接口
 *
 * 在整个框架里扮演"RAG 检索引擎"的角色：根据用户问题，从已上传文档的知识块中
 * 找出最相关的内容，供 Agent 在回答时参考。使用 TF-IDF 算法进行相关性评分。
 * 为什么用 TF-IDF 而不是向量检索：MVP 阶段不需要额外依赖（如 embedding 模型），
 * 纯文本匹配足够验证流程，后续可无缝升级为向量检索。
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { retrieveChunks } from "@/lib/rag/retrieval";
import type { Chunk } from "@/lib/rag/chunker";

export const runtime = "nodejs";

/**
 * 在知识库中检索与查询最相关的知识块
 *
 * 作用：根据用户输入的问题，返回最相关的知识块列表（按相关度排序）
 * 原理：
 *   1. 从数据库加载当前用户的所有知识块
 *   2. 用 TF-IDF 算法计算每个知识块与查询的相关度
 *      - TF（词频）：某个词在知识块中出现的频率
 *      - IDF（逆文档频率）：某个词在所有知识块中的稀有程度
 *      - 两者相乘得到最终评分，评分越高越相关
 * 参数与返回值：
 *   - 请求体：{ query: string, limit?: number }（limit 默认 5，最大 20）
 *   - 返回：{ results: Array<{ id, documentId, content, startLine, endLine, score }> }
 * 如何调用：fetch('/api/documents/search', { method: 'POST', body: JSON.stringify({ query: '什么是RAG' }) })
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
    }
    const body = await request.json();
    const query = (body.query as string ?? "").trim();
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);

    if (!query) {
      return Response.json({ results: [] });
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { document: { userId: user.id } },
      select: {
        id: true,
        documentId: true,
        content: true,
        startLine: true,
        endLine: true,
        metadata: true,
      },
    });

    const mapped: Chunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      metadata: JSON.parse(chunk.metadata || "{}") as Record<string, string>,
    }));

    const results = retrieveChunks(query, mapped, limit);

    return Response.json({
      results: results.map((result) => ({
        id: result.id,
        documentId: result.documentId,
        content: result.content,
        startLine: result.startLine,
        endLine: result.endLine,
        score: result.score,
      })),
    });
  } catch {
    return Response.json({ error: "Failed to search documents" }, { status: 500 });
  }
}
