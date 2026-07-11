import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json();
  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  const sortOrder = Number.isInteger(body.sortOrder) ? body.sortOrder : 0;
  if (!agentId) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const [workspace, agent] = await Promise.all([
    prisma.workspace.findFirst({ where: { id, userId: user.id }, select: { id: true } }),
    prisma.agent.findFirst({ where: { id: agentId, userId: user.id }, select: { id: true } }),
  ]);
  if (!workspace || !agent) return NextResponse.json({ error: "Workspace or agent not found" }, { status: 404 });

  const member = await prisma.workspaceAgent.upsert({
    where: { workspaceId_agentId: { workspaceId: workspace.id, agentId: agent.id } },
    update: { isActive: true, sortOrder },
    create: { workspaceId: workspace.id, agentId: agent.id, sortOrder },
  });
  return NextResponse.json(member, { status: 201 });
}
