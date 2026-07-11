import { calculateCost, getBudgetStatus } from "@/lib/billing";
import { demoWorkspace } from "@/lib/demo-data";
import { prisma } from "@/lib/db";
import { callLLM, callLLMWithApiKey, decryptStoredApiKey } from "@/lib/llm/router";
import { mapAgent, mapMessage, mapWorkspace } from "@/lib/mappers";
import { parseAgentMeta } from "@/lib/validation";
import { toSafeRunError } from "@/lib/errors/run-error";
import type { AgentConfig, LLMMessage, RunEvent, WorkspaceMessage, WorkspaceSnapshot, WorkspaceStatus } from "@/lib/types";

type RunWorkspaceParams = {
  input: string;
  onEvent: (event: RunEvent) => void | Promise<void>;
};

export async function runDemoWorkspace({ input, onEvent }: RunWorkspaceParams) {
  const workspace: WorkspaceSnapshot = {
    ...demoWorkspace,
    status: "running",
    messages: [...demoWorkspace.messages],
  };
  let totalSpent = workspace.totalSpent;
  let budgetStatus: WorkspaceStatus = "running";

  await onEvent({ type: "workspace_loaded", workspace });

  const userMessage: WorkspaceMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input,
    createdAt: new Date().toISOString(),
  };
  workspace.messages.push(userMessage);
  await onEvent({ type: "user_message_created", message: userMessage });

  const assistantMessages: WorkspaceMessage[] = [];

  for (const agent of workspace.agents) {
    if (totalSpent >= workspace.budgetLimit) {
      await onEvent({ type: "budget_exhausted", totalSpent, budgetLimit: workspace.budgetLimit });
      break;
    }

    await onEvent({ type: "agent_started", agent });
    const messages = buildContext(agent, input, assistantMessages);
    const result = await callLLM({ agent, messages });
    const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
    totalSpent = Number((totalSpent + cost.costUsd).toFixed(8));
    budgetStatus = getBudgetStatus(totalSpent, workspace.budgetLimit);

    const assistantMessage: WorkspaceMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      agentId: agent.id,
      content: result.content,
      createdAt: new Date().toISOString(),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: cost.costUsd,
    };
    assistantMessages.push(assistantMessage);
    workspace.messages.push(assistantMessage);

    await onEvent({
      type: "agent_completed",
      agent,
      message: assistantMessage,
      totalSpent,
      budgetStatus,
    });
  }

  await onEvent({ type: "run_completed", totalSpent, budgetStatus });
}

export async function runPersistentWorkspace({ workspaceId, userId, input, onEvent }: RunWorkspaceParams & { workspaceId: string; userId: string }) {
  const lock = await prisma.workspace.updateMany({
    where: { id: workspaceId, userId, status: { not: "running" } },
    data: { status: "running" },
  });

  if (lock.count === 0) {
    const existing = await prisma.workspace.findFirst({ where: { id: workspaceId, userId }, select: { id: true } });
    if (!existing) throw new Error("Workspace not found");
    throw new Error("Workspace is already running");
  }

  const workspaceRecord = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    include: {
      user: { include: { apiKeys: true } },
      agents: { include: { agent: { include: { credential: true } } }, orderBy: { sortOrder: "asc" } },
      messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!workspaceRecord) {
    throw new Error("Workspace not found");
  }

  const snapshot = mapWorkspace(workspaceRecord);
  let totalSpent = snapshot.totalSpent;
  let budgetStatus: WorkspaceStatus = "running";
  let finalStatus: WorkspaceStatus = "running";

  try {
    await onEvent({ type: "workspace_loaded", workspace: { ...snapshot, status: "running" } });

    const createdUserMessage = await prisma.message.create({
      data: { workspaceId, role: "user", content: input },
    });
    const userMessage = mapMessage({ ...createdUserMessage, tokenUsage: null });
    await onEvent({ type: "user_message_created", message: userMessage });

    const assistantMessages = snapshot.messages.filter((message) => message.role === "assistant");

    for (const member of workspaceRecord.agents.filter((item) => item.isActive)) {
      if (totalSpent >= snapshot.budgetLimit) {
        finalStatus = "exhausted";
        await onEvent({ type: "budget_exhausted", totalSpent, budgetLimit: snapshot.budgetLimit });
        return;
      }

      const meta = parseAgentMeta(member.agent.config);
      const agent = { ...mapAgent(member.agent), capabilityIds: meta.capabilityIds };
      await onEvent({ type: "agent_started", agent });

      try {
        // Agent 专属凭证优先；仅兼容尚未迁移的旧用户 Provider 凭证。
        const storedApiKey = member.agent.credential?.isValid
          ? member.agent.credential
          : workspaceRecord.user.apiKeys.find((key) => key.provider === member.agent.provider && key.isValid);
        const apiKey = decryptStoredApiKey(storedApiKey);
        const messages = buildContext(agent, input, assistantMessages);
        // 专用 apiUrl 优先，老记录才从 config 回退读取历史地址。
        const result = await callLLMWithApiKey({ agent, messages, apiKey, baseUrl: member.agent.apiUrl || meta.apiUrl });
        const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
        totalSpent = Number((totalSpent + cost.costUsd).toFixed(8));
        budgetStatus = getBudgetStatus(totalSpent, snapshot.budgetLimit);
        finalStatus = budgetStatus;

        const createdAssistantMessage = await prisma.message.create({
          data: {
            workspaceId,
            role: "assistant",
            agentId: agent.id,
            content: result.content,
            tokenUsage: {
              create: {
                workspaceId,
                agentId: agent.id,
                provider: agent.provider,
                model: agent.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                costUsd: cost.costUsd,
                costCny: cost.costCny,
              },
            },
          },
          include: { tokenUsage: true },
        });

        const assistantMessage = mapMessage(createdAssistantMessage);
        assistantMessages.push(assistantMessage);

        await prisma.workspace.update({ where: { id: workspaceId }, data: { totalSpent, status: budgetStatus } });
        await onEvent({ type: "agent_completed", agent, message: assistantMessage, totalSpent, budgetStatus });
      } catch (error) {
        // 单个 Agent 失败只记录本次失败，队列继续执行后面的 Agent。
        const safeError = toSafeRunError(error);
        const createdFailedMessage = await prisma.message.create({
          data: { workspaceId, role: "assistant", agentId: agent.id, content: `模型调用失败：${safeError.message}`, failed: true },
        });
        const failedMessage = mapMessage({ ...createdFailedMessage, tokenUsage: null });
        assistantMessages.push(failedMessage);
        finalStatus = "warning";
        await onEvent({ type: "agent_failed", agent, message: failedMessage, error: safeError.code, totalSpent, budgetStatus: "warning" });
      }
    }

    finalStatus = budgetStatus === "running" ? getBudgetStatus(totalSpent, snapshot.budgetLimit) : budgetStatus;
    await onEvent({ type: "run_completed", totalSpent, budgetStatus: finalStatus });
  } finally {
    // 异常中断时不能永久停留在 running，否则用户会被错误地锁在无法再次运行的状态。
    if (finalStatus === "running") finalStatus = "warning";
    await prisma.workspace.update({ where: { id: workspaceId }, data: { totalSpent, status: finalStatus } });
  }
}

function buildContext(agent: AgentConfig, userInput: string, assistantMessages: WorkspaceMessage[]): LLMMessage[] {
  const context: LLMMessage[] = [
    {
      role: "system",
      content: agent.systemPrompt,
    },
    {
      role: "user",
      content: userInput,
    },
  ];

  for (const message of assistantMessages) {
    context.push({
      role: "user",
      content: `[Previous agent ${message.agentId}]: ${message.content}`,
    });
  }

  return context;
}
