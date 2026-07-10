/**
 * Manual Run 对话运行接口
 *
 * 在整个框架里扮演"多 Agent 对话引擎"的角色：接收用户消息和启用的 Agent 列表，
 * 按顺序调用每个 Agent 的模型，流式返回对话事件（SSE），并支持从知识库检索相关内容。
 *
 * 为什么用 SSE 而不是普通 JSON：SSE 可以逐个推送 Agent 的回答，用户能看到"正在输入"的过程，
 * 而不需要等所有 Agent 都回答完才一次性返回。
 */
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { calculateCost, getBudgetStatus } from "@/lib/billing";
import { formatRetrievedKnowledge, retrieveKnowledgeSnippets } from "@/lib/capabilities/rag";
import { retrieveDocumentChunks } from "@/lib/rag/document-service";
import { describeCapabilities } from "@/lib/capabilities/registry";
import { callLLMWithApiKey } from "@/lib/llm/router";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import type { AgentConfig, KnowledgeSnippet, LLMMessage, WorkspaceMessage, WorkspaceStatus } from "@/lib/types";
import { manualRunSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/manual/run
 */
export async function POST(request: NextRequest) {
  let body: ReturnType<typeof manualRunSchema.parse>;
  try {
    body = manualRunSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid manual run payload.";
    return Response.json({ error: message || "Invalid manual run payload." }, { status: 400 });
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const persistence = await createManualRunPersistence();
        await runManualAgents({
          input: body.input,
          agents: body.agents.filter((agent) => agent.enabled),
          useRag: body.useRag,
          knowledgeSnippets: body.knowledgeSnippets,
          onEvent: send,
          persistence,
        });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Manual run failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type ManualRunPersistence = {
  enabled: boolean;
  workspaceId?: string;
  saveMessage?: (message: WorkspaceMessage) => Promise<void>;
  saveTokenUsage?: (messageId: string, agent: AgentConfig, inputTokens: number, outputTokens: number, costUsd: number, costCny: number) => Promise<void>;
};

async function createManualRunPersistence(): Promise<ManualRunPersistence> {
  try {
    const user = await getOrCreateDefaultUser();
    const workspace = await prisma.workspace.upsert({
      where: { id: "manual-run-local" },
      update: {},
      create: {
        id: "manual-run-local",
        userId: user.id,
        name: "Manual Run",
        description: "Local manual multi-agent run workspace",
        mode: "sequential",
        budgetLimit: 999999,
      },
    });
    return {
      enabled: true,
      workspaceId: workspace.id,
      saveMessage: async (message) => {
        await prisma.message.create({
          data: {
            id: message.id,
            workspaceId: workspace.id,
            role: message.role,
            agentId: message.agentId,
            content: message.content,
            failed: message.failed ?? false,
            createdAt: new Date(message.createdAt),
          },
        });
      },
      saveTokenUsage: async (messageId, agent, inputTokens, outputTokens, costUsd, costCny) => {
        await prisma.tokenUsage.create({
          data: {
            workspaceId: workspace.id,
            messageId,
            agentId: agent.id,
            provider: agent.provider,
            model: agent.model,
            inputTokens,
            outputTokens,
            costUsd,
            costCny,
          },
        });
      },
    };
  } catch {
    return { enabled: false };
  }
}

async function runManualAgents({
  input,
  agents,
  useRag,
  knowledgeSnippets,
  onEvent,
  persistence,
}: {
  input: string;
  agents: Array<AgentConfig & { apiKey?: string; apiUrl?: string }>;
  useRag?: boolean;
  knowledgeSnippets: KnowledgeSnippet[];
  onEvent: (event: unknown) => void | Promise<void>;
  persistence: ManualRunPersistence;
}) {
  if (agents.length === 0) {
    throw new Error("Please enable at least one manual agent.");
  }

  let totalSpent = 0;
  let budgetStatus: WorkspaceStatus = "running";
  const assistantMessages: WorkspaceMessage[] = [];
  const databaseKnowledge = useRag ? await retrieveDocumentChunks(input, 5) : "";

  const userMessage: WorkspaceMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input,
    createdAt: new Date().toISOString(),
  };
  await onEvent({ type: "user_message_created", message: userMessage });
  if (persistence.enabled && persistence.saveMessage) {
    await persistence.saveMessage(userMessage).catch(() => {});
  }

  for (const agent of agents) {
    await onEvent({ type: "agent_started", agent });
    try {
      const result = await callLLMWithApiKey({
        agent,
        messages: buildManualContext(agent, input, assistantMessages, knowledgeSnippets, databaseKnowledge),
        apiKey: agent.apiKey,
        baseUrl: agent.apiUrl,
      });
      const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
      totalSpent = Number((totalSpent + cost.costUsd).toFixed(8));
      budgetStatus = getBudgetStatus(totalSpent, 999999);

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

      await onEvent({
        type: "agent_completed",
        agent,
        message: assistantMessage,
        totalSpent,
        budgetStatus,
      });
      if (persistence.enabled && persistence.saveMessage) {
        await persistence.saveMessage(assistantMessage).catch(() => {});
        if (persistence.saveTokenUsage) {
          await persistence.saveTokenUsage(assistantMessage.id, agent, result.inputTokens, result.outputTokens, cost.costUsd, cost.costCny).catch(() => {});
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown model error";
      const assistantMessage: WorkspaceMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        agentId: agent.id,
        content: "我看到你的输入，但这个 Agent 的模型调用失败了。\n\n失败原因：" + errorMessage,
        createdAt: new Date().toISOString(),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      assistantMessage.failed = true;
      assistantMessages.push(assistantMessage);
      await onEvent({
        type: "agent_failed",
        agent,
        message: assistantMessage,
        error: errorMessage,
        totalSpent,
        budgetStatus,
      });
      if (persistence.enabled && persistence.saveMessage) {
        await persistence.saveMessage(assistantMessage).catch(() => {});
      }
    }
  }

  await onEvent({ type: "run_completed", totalSpent, budgetStatus });
}

function buildManualContext(agent: AgentConfig, userInput: string, assistantMessages: WorkspaceMessage[], knowledgeSnippets: KnowledgeSnippet[], databaseKnowledge: string): LLMMessage[] {
  const capabilityDescriptions = describeCapabilities(agent.capabilityIds ?? []);
  const localRetrieved = agent.capabilityIds?.includes("rag") ? formatRetrievedKnowledge(retrieveKnowledgeSnippets(userInput, knowledgeSnippets)) : "";
  const retrievedKnowledge = databaseKnowledge || localRetrieved;
  const ragEnabled = agent.capabilityIds?.includes("rag");

  const capabilityContext = capabilityDescriptions.length
    ? [
        "Enabled platform capabilities for this agent:",
        ...capabilityDescriptions.map((description) => `- ${description}`),
        ragEnabled
          ? retrievedKnowledge
            ? "The runtime has executed the RAG retrieval capability for this turn and injected matching knowledge below. Memory writes, semantic cache, and tool calls are still contract-only in v0.2."
            : "RAG retrieval is enabled but no matching knowledge was found for this query."
          : "In v0.2 only RAG retrieval can inject context. Memory writes, semantic cache, and tool calls are still registered as contracts and are not executed yet.",
      ].join("\n")
    : "No platform capabilities are enabled for this agent in this run.";

  const context: LLMMessage[] = [
    { role: "system", content: [agent.systemPrompt, capabilityContext, retrievedKnowledge].filter(Boolean).join("\n\n") },
    { role: "user", content: userInput },
  ];

  for (const message of assistantMessages) {
    context.push({
      role: "user",
      content: `[Previous agent ${agent.name}]: ${message.content}`
    });
  }

  return context;
}
