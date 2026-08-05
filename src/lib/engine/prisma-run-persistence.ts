import { prisma } from "@/lib/db";
import type { RunServicePersistence, RunServiceResult } from "@/lib/engine/run-service";

const RUN_LOCK_TTL_MS = 30 * 60 * 1000;

export type PrismaRunHandle = {
  runId: string;
  startedAt: string;
  persistence: RunServicePersistence;
  failRun: (errorCode: string) => Promise<void>;
};

/** 统一的 Run、activeRunId、消息和 TokenUsage 持久化适配器。 */
export async function createPrismaRunHandle(input: { workspaceId: string; userId: string; runInput: string }): Promise<PrismaRunHandle> {
  const workspace = await prisma.workspace.findFirst({ where: { id: input.workspaceId, userId: input.userId } });
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const staleBefore = new Date(startedAt.getTime() - RUN_LOCK_TTL_MS);
  const lock = await prisma.workspace.updateMany({
    where: { id: input.workspaceId, userId: input.userId, OR: [{ status: { not: "running" } }, { updatedAt: { lt: staleBefore } }] },
    data: { status: "running", activeRunId: runId },
  });
  if (lock.count === 0) throw new Error("WORKSPACE_ALREADY_RUNNING");

  try {
    if (workspace.status === "running" && workspace.activeRunId && workspace.updatedAt < staleBefore) {
      await prisma.run.updateMany({
        where: { id: workspace.activeRunId, workspaceId: input.workspaceId, userId: input.userId, status: "running" },
        data: { status: "warning", errorCode: "RUN_LOCK_EXPIRED", finishedAt: startedAt },
      });
    }
    await prisma.run.create({ data: { id: runId, workspaceId: input.workspaceId, userId: input.userId, input: input.runInput, startedAt } });
  } catch (error) {
    await prisma.workspace.updateMany({ where: { id: input.workspaceId, userId: input.userId, activeRunId: runId }, data: { status: "warning", activeRunId: null } });
    throw error;
  }

  const persistence: RunServicePersistence = {
    saveUserMessage: async (message) => {
      await prisma.message.create({ data: { id: message.id, workspaceId: input.workspaceId, runId, role: message.role, content: message.content, createdAt: new Date(message.createdAt) } });
    },
    saveAssistantResult: async ({ message, agent, inputTokens, outputTokens, tokenSource, costUsd, costCny }) => {
      await prisma.$transaction(async (tx) => {
        await tx.message.create({ data: { id: message.id, workspaceId: input.workspaceId, runId, role: message.role, agentId: message.agentId, content: message.content, createdAt: new Date(message.createdAt) } });
        await tx.tokenUsage.create({ data: { workspaceId: input.workspaceId, runId, messageId: message.id, agentId: agent.id, provider: agent.provider, model: agent.model, inputTokens, outputTokens, tokenSource, costUsd, costCny } });
      });
    },
    saveFailedMessage: async (message) => {
      await prisma.message.create({ data: { id: message.id, workspaceId: input.workspaceId, runId, role: message.role, agentId: message.agentId, content: message.content, failed: true, createdAt: new Date(message.createdAt) } });
    },
    updateProgress: async (totalSpent, budgetStatus) => {
      await prisma.workspace.updateMany({ where: { id: input.workspaceId, userId: input.userId, activeRunId: runId }, data: { totalSpent, status: budgetStatus } });
    },
    completeRun: async (result: Omit<RunServiceResult, "finishedAt">) => {
      const finishedAt = new Date();
      await prisma.$transaction([
        prisma.run.update({ where: { id: runId }, data: { status: result.budgetStatus, totalSpent: result.totalSpent, errorCode: result.errorCode ?? null, finishedAt } }),
        prisma.workspace.updateMany({ where: { id: input.workspaceId, userId: input.userId, activeRunId: runId }, data: { status: result.budgetStatus, totalSpent: result.totalSpent, activeRunId: null } }),
      ]);
      return finishedAt.toISOString();
    },
  };

  const failRun = async (errorCode: string) => {
    const current = await prisma.workspace.findFirst({ where: { id: input.workspaceId, userId: input.userId }, select: { totalSpent: true } });
    const finishedAt = new Date();
    await prisma.$transaction([
      prisma.run.updateMany({ where: { id: runId, workspaceId: input.workspaceId, userId: input.userId, status: "running" }, data: { status: "warning", totalSpent: current?.totalSpent ?? 0, errorCode, finishedAt } }),
      prisma.workspace.updateMany({ where: { id: input.workspaceId, userId: input.userId, activeRunId: runId }, data: { status: "warning", activeRunId: null } }),
    ]);
  };

  return { runId, startedAt: startedAt.toISOString(), persistence, failRun };
}
