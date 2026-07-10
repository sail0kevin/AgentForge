import os

content = '''/**
 * 文档上传与列表接口
 *
 * 在整个框架里扮演"知识库入口"的角色：用户上传文件后，这里负责解析文件内容、
 * 切分成知识块，并存入数据库，供后续 RAG 检索使用。
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { chunkMarkdown, chunkText } from "@/lib/rag/chunker";
import { isSupportedFormat, parseFile } from "@/lib/rag/parser";

export const runtime = "nodejs";

/**
 * 获取当前用户的所有文档列表
 */
export async function GET() {
  try {
    const user = await getOrCreateDefaultUser();
    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        title: true,
        format: true,
        size: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
    return Response.json(documents);
  } catch (error) {
    return Response.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

/**
 * 上传新文档到知识库
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getOrCreateDefaultUser();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!isSupportedFormat(file.name)) {
      return Response.json({ error: Unsupported file format:  }, { status: 400 });
    }

    const rawContent = await file.text();
    const parsed = parseFile(file.name, rawContent);

    const chunks = parsed.format === "markdown"
      ? chunkMarkdown(parsed.content, "temp")
      : chunkText(parsed.content, "temp");

    const document = await prisma.document.create({
      data: {
        userId: user.id,
        fileName: file.name,
        title: parsed.title,
        format: parsed.format,
        size: parsed.size,
        content: parsed.content,
        chunks: {
          create: chunks.map((chunk, index) => ({
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            metadata: JSON.stringify({ ...chunk.metadata, index }),
          })),
        },
      },
      select: {
        id: true,
        fileName: true,
        title: true,
        format: true,
        size: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });

    return Response.json(document, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload document";
    return Response.json({ error: message }, { status: 500 });
  }
}
'''

with open(r'src/app/api/documents/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
