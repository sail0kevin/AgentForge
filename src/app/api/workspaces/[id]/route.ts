import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapWorkspace } from "@/lib/mappers";
import { workspaceUpdateSchema } from "@/lib/validation";

const workspaceInclude = {
  agents: { include: { agent: true }, orderBy: { sortOrder: "asc" as const } },
  messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" as const } },
};

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const workspace = await prisma.workspace.findFirst({ where: { id, userId: user.id }, include: workspaceInclude });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json(mapWorkspace(workspace));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const parsed = workspaceUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message } }, { status: 400 });
  const body = parsed.data;
  const workspace = await prisma.workspace.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (body.agentIds) {
    const ownedAgentCount = await prisma.agent.count({ where: { id: { in: body.agentIds }, userId: user.id } });
    // 任何一个 Agent 不属于当前用户时都拒绝整个请求，避免跨用户关联。
    if (ownedAgentCount !== new Set(body.agentIds).size) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.workspace.update({
      where: { id: workspace.id },
      data: {
        name: body.name,
        description: body.description,
        mode: body.mode,
        budgetLimit: body.budgetLimit,
      },
    });
    if (body.agentIds) {
      await transaction.workspaceAgent.deleteMany({ where: { workspaceId: workspace.id } });
      await transaction.workspaceAgent.createMany({
        data: body.agentIds.map((agentId, index) => ({ workspaceId: workspace.id, agentId, sortOrder: index })),
      });
    }
  });

  const updated = await prisma.workspace.findFirstOrThrow({ where: { id: workspace.id, userId: user.id }, include: workspaceInclude });
  return NextResponse.json(mapWorkspace(updated));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const deleted = await prisma.workspace.deleteMany({ where: { id, userId: user.id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
