import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapWorkspace } from "@/lib/mappers";

export const runtime = "nodejs";

const workspaceInclude = {
  agents: { include: { agent: true }, orderBy: { sortOrder: "asc" as const } },
  messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" as const } },
};

/** 清空指定对话空间的历史，不删除空间本身或其中的智能体。 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await params;
  const workspace = await prisma.workspace.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (workspace.status === "running") return NextResponse.json({ error: { code: "WORKSPACE_ALREADY_RUNNING", message: "运行期间不能清空历史。" } }, { status: 409 });

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { workspaceId: workspace.id } }),
    prisma.run.deleteMany({ where: { workspaceId: workspace.id, userId: user.id } }),
    prisma.workspace.update({ where: { id: workspace.id }, data: { totalSpent: 0, status: "idle", activeRunId: null } }),
  ]);
  const updated = await prisma.workspace.findFirstOrThrow({ where: { id: workspace.id, userId: user.id }, include: workspaceInclude });
  return NextResponse.json(mapWorkspace(updated));
}
