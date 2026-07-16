import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapWorkspace } from "@/lib/mappers";
import { workspaceCreateSchema } from "@/lib/validation";

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    include: {
      agents: { include: { agent: true } },
      messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  // 旧版手动运行使用内部 `manual-run-*` 空间保存历史；它们不是用户创建的任务空间，
  // 不应出现在新的任务空间选择器中。
  return NextResponse.json(workspaces.filter((workspace) => !workspace.id.startsWith("manual-run-")).map(mapWorkspace));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  try {
    const body = workspaceCreateSchema.parse(await request.json());
    if (body.agentIds.length > 0) {
      const ownedAgentCount = await prisma.agent.count({ where: { id: { in: body.agentIds }, userId: user.id } });
      if (ownedAgentCount !== body.agentIds.length) {
        return NextResponse.json({ error: { code: "AGENT_NOT_FOUND", message: "One or more Agents do not belong to the current user." } }, { status: 404 });
      }
    }
    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        description: body.description,
        mode: body.mode,
        budgetLimit: body.budgetLimit,
        userId: user.id,
        agents: { create: body.agentIds.map((agentId, index) => ({ agentId, sortOrder: index })) },
      },
      include: { agents: { include: { agent: true }, orderBy: { sortOrder: "asc" } }, messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(mapWorkspace(workspace), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message } }, { status: 400 });
    return NextResponse.json({ error: { code: "WORKSPACE_CREATE_FAILED", message: "Workspace creation failed." } }, { status: 500 });
  }
}
