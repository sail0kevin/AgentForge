import { calculateCost, getBudgetStatus } from "@/lib/billing";
import { toSafeRunError } from "@/lib/errors/run-error";
import { parseRunServiceEvent, type RunServiceEvent } from "@/lib/engine/run-contract";
import { resolveRunCompletionStatus } from "@/lib/engine/run-status";
import type { AgentConfig, LLMResult, WorkspaceMessage, WorkspaceSnapshot, WorkspaceStatus } from "@/lib/types";

export type PriorAgentOutput = { agentName: string; content: string };

export type RunServiceAgent = {
  agent: AgentConfig;
  invoke: (input: { priorAssistantMessages: PriorAgentOutput[]; signal: AbortSignal }) => Promise<LLMResult>;
};

export type RunServiceResult = {
  runId: string;
  totalSpent: number;
  budgetStatus: Exclude<WorkspaceStatus, "running">;
  errorCode?: string;
  startedAt: string;
  finishedAt: string;
};

export type RunServicePersistence = {
  saveUserMessage: (message: WorkspaceMessage) => Promise<void>;
  saveAssistantResult: (input: { message: WorkspaceMessage; agent: AgentConfig; inputTokens: number; outputTokens: number; costUsd: number; costCny: number }) => Promise<void>;
  saveFailedMessage: (message: WorkspaceMessage) => Promise<void>;
  updateProgress: (totalSpent: number, budgetStatus: WorkspaceStatus) => Promise<void>;
  completeRun: (result: Omit<RunServiceResult, "finishedAt">) => Promise<string>;
};

export type RunServiceInput = {
  runId: string;
  startedAt: string;
  userId?: string;
  input: string;
  workspace?: WorkspaceSnapshot;
  agents: RunServiceAgent[];
  priorAssistantMessages?: PriorAgentOutput[];
  initialTotalSpent: number;
  budgetLimit: number;
  signal: AbortSignal;
  persistence: RunServicePersistence;
  eventSink: (event: RunServiceEvent) => void | Promise<void>;
};

type RunServiceEventPayload<T = RunServiceEvent> = T extends RunServiceEvent ? Omit<T, "version" | "runId"> : never;

/**
 * 所有运行入口共享的唯一顺序执行状态机。
 * HTTP、Cookie、Prisma 查询、凭证解密和 SSE 编码由适配器负责；这里仅处理可测试的业务语义。
 */
export async function runService(input: RunServiceInput): Promise<RunServiceResult> {
  const emit = async (event: RunServiceEventPayload) => {
    await input.eventSink(parseRunServiceEvent({ ...event, version: 1, runId: input.runId }));
  };
  let totalSpent = input.initialTotalSpent;
  let budgetStatus: WorkspaceStatus = getBudgetStatus(totalSpent, input.budgetLimit);
  let hadAgentFailure = false;
  let errorCode: string | undefined;
  const priorAssistantMessages = [...(input.priorAssistantMessages ?? [])];

  await emit({ type: "run_created", startedAt: input.startedAt });
  if (input.workspace) await emit({ type: "workspace_loaded", workspace: { ...input.workspace, status: "running" } });

  const userMessage: WorkspaceMessage = {
    id: crypto.randomUUID(), runId: input.runId, role: "user", content: input.input, createdAt: new Date().toISOString(),
  };
  await input.persistence.saveUserMessage(userMessage);
  await emit({ type: "user_message_created", message: userMessage });

  for (const runner of input.agents) {
    if (input.signal.aborted) {
      hadAgentFailure = true;
      errorCode = "RUN_CANCELLED";
      break;
    }
    if (totalSpent >= input.budgetLimit) {
      budgetStatus = "exhausted";
      await emit({ type: "budget_exhausted", totalSpent, budgetLimit: input.budgetLimit });
      break;
    }

    await emit({ type: "agent_started", agent: runner.agent });
    let result: LLMResult;
    try {
      result = await runner.invoke({ priorAssistantMessages: [...priorAssistantMessages], signal: input.signal });
    } catch (error) {
      hadAgentFailure = true;
      const safeError = toSafeRunError(error);
      const message: WorkspaceMessage = {
        id: crypto.randomUUID(), runId: input.runId, role: "assistant", agentId: runner.agent.id,
        content: `模型调用失败：${safeError.message}`, createdAt: new Date().toISOString(), failed: true,
      };
      await input.persistence.saveFailedMessage(message);
      priorAssistantMessages.push({ agentName: runner.agent.name, content: message.content });
      await emit({ type: "agent_failed", agent: runner.agent, message, error: safeError.code, totalSpent, budgetStatus: "warning" });
      if (safeError.code === "RUN_CANCELLED" || safeError.code === "PROVIDER_TIMEOUT") {
        errorCode = safeError.code;
        break;
      }
      continue;
    }

    const cost = calculateCost(runner.agent.model, result.inputTokens, result.outputTokens);
    totalSpent = Number((totalSpent + cost.costUsd).toFixed(8));
    budgetStatus = getBudgetStatus(totalSpent, input.budgetLimit);
    const message: WorkspaceMessage = {
      id: crypto.randomUUID(), runId: input.runId, role: "assistant", agentId: runner.agent.id,
      content: result.content, createdAt: new Date().toISOString(), inputTokens: result.inputTokens,
      outputTokens: result.outputTokens, costUsd: cost.costUsd,
    };
    await input.persistence.saveAssistantResult({ message, agent: runner.agent, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: cost.costUsd, costCny: cost.costCny });
    await input.persistence.updateProgress(totalSpent, budgetStatus);
    priorAssistantMessages.push({ agentName: runner.agent.name, content: message.content });
    await emit({ type: "agent_completed", agent: runner.agent, message, totalSpent, budgetStatus });
  }

  const finalStatus = resolveRunCompletionStatus({ budgetStatus, hadAgentFailure });
  const withoutFinishedAt = { runId: input.runId, totalSpent, budgetStatus: finalStatus, errorCode, startedAt: input.startedAt };
  const finishedAt = await input.persistence.completeRun(withoutFinishedAt);
  const result = { ...withoutFinishedAt, finishedAt };
  await emit({ type: "run_completed", totalSpent, budgetStatus: finalStatus, errorCode, finishedAt });
  return result;
}
