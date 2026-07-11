import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { calculateCost, getBudgetStatus } from "@/lib/billing";
import { formatRetrievedKnowledge, retrieveKnowledgeSnippets } from "@/lib/capabilities/rag";
import { retrieveDocumentChunks } from "@/lib/rag/document-service";
import { describeCapabilities } from "@/lib/capabilities/registry";
import { callLLMWithApiKey, decryptStoredApiKey } from "@/lib/llm/router";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { mapAgent } from "@/lib/mappers";
import type { AgentConfig, KnowledgeSnippet, LLMMessage, WorkspaceMessage, WorkspaceStatus } from "@/lib/types";
import { manualRunSchema, parseAgentMeta } from "@/lib/validation";
import { toSafeRunError } from "@/lib/errors/run-error";

export const runtime = "nodejs";

/** 手动运行只接受已认证用户的 Agent ID，密钥只在服务端解密和使用。 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let body: ReturnType<typeof manualRunSchema.parse>;
  try {
    body = manualRunSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid manual run payload.";
    return Response.json({ error: message || "Invalid manual run payload." }, { status: 400 });
  }

  const records = await prisma.agent.findMany({
    where: { id: { in: body.agentIds }, userId: user.id },
    include: {
      credential: true,
      user: { select: { apiKeys: { where: { isValid: true } } } },
    },
  });
  if (records.length !== new Set(body.agentIds).size) return Response.json({ error: "Agent not found" }, { status: 404 });

  const agents = body.agentIds.map((id) => records.find((record) => record.id === id)!).map((record) => {
    const meta = parseAgentMeta(record.config);
    return {
      agent: { ...mapAgent(record), capabilityIds: meta.capabilityIds },
      // 新列优先，历史 config 中的 apiUrl 仅用于还未完成数据库迁移的记录。
      apiUrl: record.apiUrl || meta.apiUrl,
      // Agent 独立凭证优先，旧版用户 Provider Key 仅作为回退兼容。
      storedApiKey: record.credential?.isValid
        ? record.credential
        : record.user.apiKeys.find((key) => key.provider === record.provider),
    };
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const persistence = await createManualRunPersistence(user.id);
        await runManualAgents({ input: body.input, agents, useRag: body.useRag, knowledgeSnippets: body.knowledgeSnippets, onEvent: send, persistence, userId: user.id });
      } catch (error) {
        const safeError = toSafeRunError(error);
        send({ type: "error", message: safeError.message, code: safeError.code });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

type ManualRunPersistence = {
  saveMessage: (message: WorkspaceMessage) => Promise<void>;
  saveAssistantResult: (message: WorkspaceMessage, agent: AgentConfig, inputTokens: number, outputTokens: number, costUsd: number, costCny: number) => Promise<void>;
};

async function createManualRunPersistence(userId: string): Promise<ManualRunPersistence> {
  const workspaceId = `manual-run-${userId}`;
  const workspace = await prisma.workspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId, userId, name: "Manual Run", description: "Personal manual multi-agent run workspace", mode: "sequential", budgetLimit: 999999 } });
  if (workspace.userId !== userId) throw new Error("PERSISTENCE_UNAVAILABLE");

  return {
    saveMessage: async (message) => {
      await prisma.message.create({ data: { id: message.id, workspaceId: workspace.id, role: message.role, agentId: message.agentId, content: message.content, failed: message.failed ?? false, createdAt: new Date(message.createdAt) } });
    },
    saveAssistantResult: async (message, agent, inputTokens, outputTokens, costUsd, costCny) => {
      // 回复和用量在同一个事务中保存，避免刷新后只有消息却没有费用数据。
      await prisma.$transaction(async (tx) => {
        await tx.message.create({ data: { id: message.id, workspaceId: workspace.id, role: message.role, agentId: message.agentId, content: message.content, failed: false, createdAt: new Date(message.createdAt) } });
        await tx.tokenUsage.create({ data: { workspaceId: workspace.id, messageId: message.id, agentId: agent.id, provider: agent.provider, model: agent.model, inputTokens, outputTokens, costUsd, costCny } });
      });
    },
  };
}

type RunnableAgent = { agent: AgentConfig; apiUrl: string; storedApiKey?: { encryptedKey: string; iv: string; authTag: string } | null };

async function runManualAgents({ input, agents, useRag, knowledgeSnippets, onEvent, persistence, userId }: { input: string; agents: RunnableAgent[]; useRag?: boolean; knowledgeSnippets: KnowledgeSnippet[]; onEvent: (event: unknown) => void | Promise<void>; persistence: ManualRunPersistence; userId: string }) {
  let totalSpent = 0;
  let budgetStatus: WorkspaceStatus = "running";
  const assistantMessages: WorkspaceMessage[] = [];
  const databaseKnowledge = useRag ? await retrieveDocumentChunks(userId, input, 5) : "";
  const userMessage: WorkspaceMessage = { id: crypto.randomUUID(), role: "user", content: input, createdAt: new Date().toISOString() };
  await onEvent({ type: "user_message_created", message: userMessage });
  await persistence.saveMessage(userMessage);

  const agentNames = new Map(agents.map(({ agent }) => [agent.id, agent.name]));
  for (const { agent, apiUrl, storedApiKey } of agents) {
    await onEvent({ type: "agent_started", agent });
    try {
      const apiKey = decryptStoredApiKey(storedApiKey);
      if (agent.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
      const result = await callLLMWithApiKey({ agent, messages: buildManualContext(agent, input, assistantMessages, agentNames, knowledgeSnippets, databaseKnowledge), apiKey, baseUrl: apiUrl });
      const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
      totalSpent = Number((totalSpent + cost.costUsd).toFixed(8));
      budgetStatus = getBudgetStatus(totalSpent, 999999);
      const message: WorkspaceMessage = { id: crypto.randomUUID(), role: "assistant", agentId: agent.id, content: result.content, createdAt: new Date().toISOString(), inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: cost.costUsd };
      await persistence.saveAssistantResult(message, agent, result.inputTokens, result.outputTokens, cost.costUsd, cost.costCny);
      assistantMessages.push(message);
      await onEvent({ type: "agent_completed", agent, message, totalSpent, budgetStatus });
    } catch (error) {
      const safeError = toSafeRunError(error);
      const message: WorkspaceMessage = { id: crypto.randomUUID(), role: "assistant", agentId: agent.id, content: `模型调用失败：${safeError.message}`, createdAt: new Date().toISOString(), failed: true };
      // 失败消息也必须先落库，刷新后用户仍能看到真实的失败结果。
      await persistence.saveMessage(message);
      assistantMessages.push(message);
      await onEvent({ type: "agent_failed", agent, message, error: safeError.code, totalSpent, budgetStatus });
    }
  }
  await onEvent({ type: "run_completed", totalSpent, budgetStatus });
}

function buildManualContext(agent: AgentConfig, userInput: string, assistantMessages: WorkspaceMessage[], agentNames: Map<string, string>, knowledgeSnippets: KnowledgeSnippet[], databaseKnowledge: string): LLMMessage[] {
  const capabilities = describeCapabilities(agent.capabilityIds ?? []);
  const localKnowledge = agent.capabilityIds?.includes("rag") ? formatRetrievedKnowledge(retrieveKnowledgeSnippets(userInput, knowledgeSnippets)) : "";
  const context: LLMMessage[] = [{ role: "system", content: [agent.systemPrompt, capabilities.map((item) => `- ${item}`).join("\n"), databaseKnowledge || localKnowledge].filter(Boolean).join("\n\n") }, { role: "user", content: userInput }];
  // 根据消息上的 agentId 标注真正的作者，避免后续 Agent 把前序观点认成自己的输出。
  for (const message of assistantMessages) {
    const previousAgentName = message.agentId ? agentNames.get(message.agentId) ?? message.agentId : "unknown";
    context.push({ role: "user", content: `[Previous agent ${previousAgentName}]: ${message.content}` });
  }
  return context;
}
