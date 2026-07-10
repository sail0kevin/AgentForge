import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapWorkspace } from "@/lib/mappers";
import { workspaceUpdateSchema } from "@/lib/validation";

const workspaceInclude = {
  agents: { include: { agent: true }, orderBy: { sortOrder: "asc" as const } },
  messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" as const } },
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOrCreateDefaultUser();
  const workspace = await prisma.workspace.findFirst({
    where: { id, userId: user.id },
    include: workspaceInclude,
  });

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json(mapWorkspace(workspace));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = workspaceUpdateSchema.parse(await request.json());
  const user = await getOrCreateDefaultUser();

  await prisma.workspace.update({
    where: { id, userId: user.id },
    data: {
      name: body.name,
      description: body.description,
      mode: body.mode,
      budgetLimit: body.budgetLimit,
    },
  });

  if (body.agentIds) {
    await prisma.workspaceAgent.deleteMany({ where: { workspaceId: id } });
    await prisma.workspaceAgent.createMany({
      data: body.agentIds.map((agentId, index) => ({ workspaceId: id, agentId, sortOrder: index })),
    });
  }

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { id, userId: user.id },
    include: workspaceInclude,
  });

  return NextResponse.json(mapWorkspace(workspace));
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOrCreateDefaultUser();
  await prisma.workspace.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
