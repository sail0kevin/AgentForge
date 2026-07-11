import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; agentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id, agentId } = await params;
  const workspace = await prisma.workspace.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const deleted = await prisma.workspaceAgent.deleteMany({ where: { workspaceId: workspace.id, agentId } });
  if (deleted.count === 0) return NextResponse.json({ error: "Agent membership not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
