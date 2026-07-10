import os

content = '''/**
 * 文档详情与删除接口
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/current-user";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const user = await getOrCreateDefaultUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      include: {
        chunks: {
          orderBy: { startLine: "asc" },
          select: {
            id: true,
            content: true,
            startLine: true,
            endLine: true,
            metadata: true,
          },
        },
      },
    });

    if (!document) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    return Response.json(document);
  } catch (error) {
    return Response.json({ error: "Failed to get document" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const user = await getOrCreateDefaultUser();
    const { id } = await params;

    const existing = await prisma.document.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });

    if (!existing) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
'''

path = r"src/app/api/documents/[id]/route.ts"
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
