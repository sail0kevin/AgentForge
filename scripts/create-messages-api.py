# Create GET endpoint to load manual run messages
content = '''/**
 * 加载手动工作区的历史消息
 *
 * 作为整个消息持久化链路中的"读取侧"：页面刷新后，前端从这里取回历史对话。
 * 与 POST /api/workspaces/manual/run 中的 createManualRunPersistence() 配套，
 * 一个写、一个读，形成完整闭环。
 */
import { prisma } from "@/lib/db";
import { mapMessage } from "@/lib/mappers";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/manual/messages
 *
 * 作用：读取 manual-run-local 工作区的历史消息
 * 原理：
 *   1. 查找或创建 manual-run-local 工作区
 *   2. 按时间正序返回该工作区下的消息（包含 tokenUsage 账单信息）
 *
 * 返回：WorkspaceMessage[] 数组
 */
export async function GET() {
  try {
    const workspace = await prisma.workspace.upsert({
      where: { id: "manual-run-local" },
      update: {},
      create: {
        id: "manual-run-local",
        userId: "local-anonymous",
        name: "Manual Run",
        mode: "sequential",
        budgetLimit: 999999,
      },
    });

    const messages = await prisma.message.findMany({
      where: { workspaceId: workspace.id },
      include: { tokenUsage: true },
      orderBy: { createdAt: "asc" },
    });

    return Response.json(messages.map(mapMessage), { status: 200 });
  } catch (error) {
    return Response.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/manual/messages
 *
 * 作用：清空 manual-run-local 工作区的全部历史消息
 * 原理：先找到工作区，再删除其下所有消息（级联清理 tokenUsage）
 */
export async function DELETE() {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: "manual-run-local" },
    });
    if (!workspace) {
      return Response.json({ success: true }, { status: 200 });
    }
    await prisma.message.deleteMany({
      where: { workspaceId: workspace.id },
    });
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: "Failed to clear messages" },
      { status: 500 }
    );
  }
}
''';

$dir = "src/app/api/workspaces/manual/messages";
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$path = "$dir/route.ts"
[System.IO.File]::WriteAllText($path, content, [System.Text.Encoding]::UTF8)
print("Created $path")
