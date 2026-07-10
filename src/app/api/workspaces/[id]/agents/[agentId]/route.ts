import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; agentId: string }> }) {
  const { id, agentId } = await params;
  await prisma.workspaceAgent.deleteMany({ where: { workspaceId: id, agentId } });
  return NextResponse.json({ ok: true });
}
