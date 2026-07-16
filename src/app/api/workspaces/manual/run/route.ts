import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { retrieveDocumentChunks } from "@/lib/rag/document-service";
import { describeCapabilities } from "@/lib/capabilities/registry";
import { callLLMWithApiKey } from "@/lib/llm/router";
import { decryptStoredApiKey } from "@/lib/security/credentials";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { mapAgent } from "@/lib/mappers";
import { runSingleAgentGraph } from "@/lib/engine/langgraph/single-agent";
import { runService } from "@/lib/engine/run-service";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import type { AgentConfig } from "@/lib/types";
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
  const runController = new AbortController();
  const abortRun = () => {
    if (!runController.signal.aborted) runController.abort(new Error("RUN_CANCELLED"));
  };
  request.signal.addEventListener("abort", abortRun, { once: true });
  let streamClosed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (streamClosed || runController.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          streamClosed = true;
          abortRun();
        }
      };
      let handle: Awaited<ReturnType<typeof createPrismaRunHandle>> | null = null;
      try {
        const workspaceId = `manual-run-${user.id}`;
        await prisma.workspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId, userId: user.id, name: "Manual Run", description: "Personal manual multi-agent run workspace", mode: "sequential", budgetLimit: 999999 } });
        handle = await createPrismaRunHandle({ workspaceId, userId: user.id, runInput: body.input });
        const databaseKnowledge = body.useRag ? await retrieveDocumentChunks(user.id, body.input, 5) : "";
        await runService({
          runId: handle.runId, startedAt: handle.startedAt, userId: user.id, input: body.input,
          agents: agents.map(({ agent, apiUrl, storedApiKey }) => ({
            agent,
            invoke: async ({ priorAssistantMessages, signal }) => {
              const apiKey = decryptStoredApiKey(storedApiKey);
              if (agent.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
              return runSingleAgentGraph(
                {
                  retrieveContext: async () => buildManualKnowledgeContext(agent, databaseKnowledge),
                  invokeAgent: async ({ agent: graphAgent, messages }) => callLLMWithApiKey({ agent: graphAgent, messages, apiKey, baseUrl: apiUrl, signal }),
                },
                { agent, input: body.input, systemContext: buildManualSystemContext(agent), userId: user.id, priorAssistantMessages },
              );
            },
          })),
          initialTotalSpent: 0, budgetLimit: 999999, signal: runController.signal,
          persistence: handle.persistence, eventSink: send,
        });
      } catch (error) {
        const safeError = toSafeRunError(error);
        if (handle) {
          try {
            await handle.failRun(safeError.code);
          } catch {
            // 原始安全错误仍需返回；锁会由 activeRunId 所有权保护，避免误释放其他运行。
          }
        }
        send({ version: 1, type: "error", runId: handle?.runId, message: safeError.message, code: safeError.code });
      } finally {
        request.signal.removeEventListener("abort", abortRun);
        if (!streamClosed) {
          streamClosed = true;
          try { controller.close(); } catch { abortRun(); }
        }
      }
    },
    cancel() {
      streamClosed = true;
      abortRun();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

function buildManualSystemContext(agent: AgentConfig): string {
  const capabilities = describeCapabilities(agent.capabilityIds ?? []);
  return [agent.systemPrompt, capabilities.map((item) => `- ${item}`).join("\n")].filter(Boolean).join("\n\n");
}

function buildManualKnowledgeContext(agent: AgentConfig, databaseKnowledge: string): string {
  // 产品运行只读取按 userId隔离、可追溯的服务端 Document/Chunk；浏览器临时片段不再注入模型。
  return agent.capabilityIds?.includes("rag") ? databaseKnowledge : "";
}
