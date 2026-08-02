import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { chunkMarkdown, chunkText } from "@/lib/rag/chunker";
import { persistDocumentEmbeddings } from "@/lib/rag/document-embeddings";
import { isSupportedFormat, parseFile } from "@/lib/rag/parser";
import {
  assertDocumentQuota,
  assertUploadFileMetadata,
  assertUploadRequestSize,
  decodeUtf8Document,
  DocumentUploadError,
  documentUploadErrorResponse,
  parseKnowledgeSourceMetadata,
} from "@/lib/rag/upload-policy";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

/** 获取当前用户的所有文档列表。 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, fileName: true, title: true, format: true, size: true, checksumSha256: true,
        sourceType: true, sourceUrl: true, sourceVersion: true, license: true, reviewedAt: true, createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
    return Response.json(documents);
  } catch {
    return Response.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

/** 上传新文档到当前用户的知识库。 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    // 第一层在 multipart 解析前依据请求头拒绝明显超限的请求。
    assertUploadRequestSize(request.headers);
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new DocumentUploadError("INVALID_MULTIPART", "Upload body is not valid multipart form data.", 400);
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new DocumentUploadError("FILE_REQUIRED", "No file provided.", 400);
    if (!isSupportedFormat(file.name)) throw new DocumentUploadError("UNSUPPORTED_FILE_FORMAT", "Unsupported file format.", 415);

    // 第二层必须在读取文件内容前检查 File.size；它按字节计算，不会低估中文内容。
    assertUploadFileMetadata(file);
    const source = parseKnowledgeSourceMetadata(formData);
    const fileBytes = await file.arrayBuffer();
    const rawContent = decodeUtf8Document(fileBytes);
    const parsed = parseFile(file.name, rawContent, file.size);
    const documentId = crypto.randomUUID();
    const chunks = parsed.format === "markdown" ? chunkMarkdown(parsed.content, documentId) : chunkText(parsed.content, documentId);
    const checksumSha256 = createHash("sha256").update(Buffer.from(fileBytes)).digest("hex");

    // 配额读取与写入处在同一个事务中；嵌套创建保证 Document/Chunk 要么全成功、要么全回滚。
    const document = await prisma.$transaction(async (tx) => {
      const [documentCount, sizeAggregate, totalChunks] = await Promise.all([
        tx.document.count({ where: { userId: user.id } }),
        tx.document.aggregate({ where: { userId: user.id }, _sum: { size: true } }),
        tx.documentChunk.count({ where: { document: { userId: user.id } } }),
      ]);
      assertDocumentQuota({ documentCount, totalBytes: sizeAggregate._sum.size ?? 0, totalChunks }, parsed.size, chunks.length);

      return tx.document.create({
        data: {
          id: documentId, userId: user.id, fileName: file.name, title: parsed.title, format: parsed.format, size: parsed.size, content: parsed.content,
          checksumSha256, ...source,
          chunks: { create: chunks.map((chunk, index) => ({ content: chunk.content, startLine: chunk.startLine, endLine: chunk.endLine, metadata: JSON.stringify({ ...chunk.metadata, index, documentTitle: parsed.title, fileName: file.name, format: parsed.format, sourceType: source.sourceType, sourceUrl: source.sourceUrl ?? "", sourceVersion: source.sourceVersion, license: source.license, reviewedAt: source.reviewedAt?.toISOString() ?? "" }) })) },
        },
        select: { id: true, fileName: true, title: true, format: true, size: true, checksumSha256: true, sourceType: true, sourceUrl: true, sourceVersion: true, license: true, reviewedAt: true, createdAt: true, chunks: { select: { id: true, content: true, startLine: true, endLine: true, metadata: true } }, _count: { select: { chunks: true } } },
      });
    });
    const embeddingStatus = await persistDocumentEmbeddings(document.chunks.map((chunk) => ({
      ...chunk,
      documentId: document.id,
      metadata: JSON.parse(chunk.metadata) as Record<string, string>,
    })));
    const { chunks: persistedChunks, ...response } = document;
    void persistedChunks;
    return Response.json({ ...response, embeddingStatus }, { status: 201 });
  } catch (error) {
    return documentUploadErrorResponse(error);
  }
}
