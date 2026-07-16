import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { mapMessage } from "@/lib/mappers";

export const runtime = "nodejs";

function manualWorkspaceId(userId: string) {
  return `manual-run-${userId}`;
}

/** 读取当前用户手动工作区的消息，历史绝不跨账号共享。 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
    const workspaceId = manualWorkspaceId(user.id);
    const workspace = await prisma.workspace.upsert({
      where: { id: workspaceId }, update: {},
      create: { id: workspaceId, userId: user.id, name: "Manual Run", mode: "sequential", budgetLimit: 999999 },
    });
    if (workspace.userId !== user.id) return Response.json({ error: "Workspace not found" }, { status: 404 });
    const messages = await prisma.message.findMany({ where: { workspaceId }, include: { tokenUsage: true }, orderBy: { createdAt: "asc" } });
    return Response.json(messages.map(mapMessage));
  } catch {
    return Response.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/** 删除当前用户手动工作区的消息。 */
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
    const workspace = await prisma.workspace.findFirst({ where: { id: manualWorkspaceId(user.id), userId: user.id }, select: { id: true, status: true } });
    if (!workspace) return Response.json({ success: true });
    if (workspace.status === "running") {
      return Response.json({ error: { code: "WORKSPACE_ALREADY_RUNNING", message: "运行期间不能清空历史。" } }, { status: 409 });
    }
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.run.deleteMany({ where: { workspaceId: workspace.id, userId: user.id } }),
      prisma.workspace.update({ where: { id: workspace.id }, data: { totalSpent: 0, status: "idle", activeRunId: null } }),
    ]);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to clear messages" }, { status: 500 });
  }
}
