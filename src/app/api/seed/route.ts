import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getAuthMode } from "@/lib/auth/session";
import { demoWorkspace } from "@/lib/demo-data";
import { prisma } from "@/lib/db";

const defaultAgents = [
  {
    name: "需求澄清师",
    avatar: "澄清",
    color: "#5B5BD6",
    systemPrompt: "你是一名需求澄清师。请先判断需求是否足够明确，补齐目标用户、核心流程、页面范围、限制和验收标准，再给后续智能体提供可追溯的需求结论。",
  },
  {
    name: "产品/UI报告架构师",
    avatar: "UI",
    color: "#0EA5E9",
    systemPrompt: "你是一名产品/UI报告架构师。请阅读澄清后的需求，整理成可交给下游 AI 编程 Agent 的产品/UI实施规格，覆盖页面、路由、状态、用户流程、设计方向、组件、响应式、无障碍和视觉验收标准。",
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
