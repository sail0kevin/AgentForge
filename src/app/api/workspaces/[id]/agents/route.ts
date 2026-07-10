import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agentId, sortOrder = 0 } = await request.json();
  const member = await prisma.workspaceAgent.upsert({
    where: { workspaceId_agentId: { workspaceId: id, agentId } },
    update: { isActive: true, sortOrder },
    create: { workspaceId: id, agentId, sortOrder },
  });

  return NextResponse.json(member, { status: 201 });
}
