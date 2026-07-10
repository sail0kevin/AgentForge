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
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { retrieveChunks, formatRetrievedChunks } from "@/lib/rag/retrieval";
import type { Chunk } from "@/lib/rag/chunker";

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
export async function retrieveDocumentChunks(query: string, limit: number = 5): Promise<string> {
  try {
    const user = await getOrCreateDefaultUser();

    // 从数据库加载当前用户的所有知识块
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

    // 如果没有知识块，直接返回空字符串
    if (chunks.length === 0) return "";

    // 转换为检索模块需要的 Chunk 格式
    const mapped: Chunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      metadata: JSON.parse(chunk.metadata || "{}") as Record<string, string>,
    }));

    // 用 TF-IDF 检索最相关的知识块
    const results = retrieveChunks(query, mapped, limit);

    // 如果没有匹配结果，返回空字符串
    if (results.length === 0) return "";

    // 格式化为可注入 Prompt 的文本
    return formatRetrievedChunks(results);
  } catch (error) {
    // 检索失败不影响主流程，静默降级为空字符串
    console.error('Document retrieval failed:', error);
    return "";
  }
}