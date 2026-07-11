import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function unauthorized() {
  return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
      include: { chunks: { orderBy: { startLine: "asc" }, select: { id: true, content: true, startLine: true, endLine: true, metadata: true } } },
    });
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    return Response.json(document);
  } catch {
    return Response.json({ error: "Failed to get document" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const deleted = await prisma.document.deleteMany({ where: { id, userId: user.id } });
    if (deleted.count === 0) return Response.json({ error: "Document not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
