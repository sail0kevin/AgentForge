import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getAuthMode } from "@/lib/auth/session";
import { demoWorkspace } from "@/lib/demo-data";
import { prisma } from "@/lib/db";

const defaultAgents = [
  {
    name: "需求分析师",
    avatar: "需求",
    color: "#5B5BD6",
    systemPrompt: "你是一名需求分析师。请分析用户目标、限制、验收标准和风险，并给下一位智能体提供清晰的需求结论。",
  },
  {
    name: "开发报告负责人",
    avatar: "报告",
    color: "#0EA5E9",
    systemPrompt: "你是一名技术负责人。请阅读用户需求和前一位智能体的分析，整理成简洁的开发报告，包含方案、任务、测试、风险和下一步。",
  },
];

/** Seed 只能在显式 local 模式运行，避免生产环境的演示接口改写用户数据。 */
export async function POST() {
  if (getAuthMode() !== "local") {
    return NextResponse.json({ error: "Seed is only available in local mode" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspaceId = `demo-${user.id}`;
  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: demoWorkspace.name, description: demoWorkspace.description, mode: demoWorkspace.mode, budgetLimit: demoWorkspace.budgetLimit },
    create: { id: workspaceId, userId: user.id, name: demoWorkspace.name, description: demoWorkspace.description, mode: demoWorkspace.mode, budgetLimit: demoWorkspace.budgetLimit },
  });
  await prisma.workspaceAgent.deleteMany({ where: { workspaceId: workspace.id } });
  const existingCount = await prisma.agent.count({ where: { userId: user.id } });
  if (existingCount === 0) {
    await prisma.agent.createMany({
      data: defaultAgents.map((agent) => ({
        ...agent,
        userId: user.id,
        provider: "ollama",
        model: "qwen2.5:3b",
        apiUrl: "http://localhost:11434",
        temperature: 0.4,
        maxTokens: 1200,
        config: JSON.stringify({ capabilityIds: [] }),
      })),
    });
  }
  const agentCount = await prisma.agent.count({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, workspaceId: workspace.id, agentCount });
}
