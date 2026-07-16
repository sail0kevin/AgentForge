import { demoWorkspace } from "@/lib/demo-data";
import { prisma } from "@/lib/db";
import { callLLM, callLLMWithApiKey } from "@/lib/llm/router";
import { decryptStoredApiKey } from "@/lib/security/credentials";
import { mapAgent, mapWorkspace } from "@/lib/mappers";
import { parseAgentMeta } from "@/lib/validation";
import { toSafeRunError } from "@/lib/errors/run-error";
import { runService } from "@/lib/engine/run-service";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import { runSingleAgentGraph } from "@/lib/engine/langgraph/single-agent";
import { retrieveDocumentChunks } from "@/lib/rag/document-service";
import { describeCapabilities } from "@/lib/capabilities/registry";
import type { RunEvent, WorkspaceSnapshot } from "@/lib/types";

type RunWorkspaceParams = {
  input: string;
  onEvent: (event: RunEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export async function runDemoWorkspace({ input, onEvent, signal }: RunWorkspaceParams) {
  const workspace: WorkspaceSnapshot = {
    ...demoWorkspace,
    status: "running",
    messages: [...demoWorkspace.messages],
  };
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  return runService({
    runId, startedAt, input, workspace,
    agents: workspace.agents.map((agent) => ({
      agent,
      invoke: ({ priorAssistantMessages, signal: runSignal }) => runSingleAgentGraph(
        { retrieveContext: async () => "", invokeAgent: ({ agent: graphAgent, messages }) => callLLM({ agent: graphAgent, messages, signal: runSignal }) },
        { agent, input, systemContext: agent.systemPrompt, priorAssistantMessages },
      ),
    })),
    initialTotalSpent: workspace.totalSpent, budgetLimit: workspace.budgetLimit,
    signal: signal ?? new AbortController().signal,
    persistence: {
      saveUserMessage: async () => undefined,
      saveAssistantResult: async () => undefined,
      saveFailedMessage: async () => undefined,
      updateProgress: async () => undefined,
      completeRun: async () => new Date().toISOString(),
    },
    eventSink: onEvent,
  });
}

export async function runPersistentWorkspace({ workspaceId, userId, input, onEvent, signal }: RunWorkspaceParams & { workspaceId: string; userId: string }) {
  const handle = await createPrismaRunHandle({ workspaceId, userId, runInput: input });
  try {
    const workspaceRecord = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      include: {
        user: { include: { apiKeys: true } },
        agents: { include: { agent: { include: { credential: true } } }, orderBy: { sortOrder: "asc" } },
        messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!workspaceRecord) throw new Error("WORKSPACE_NOT_FOUND");
    const snapshot = mapWorkspace(workspaceRecord);
    const databaseKnowledge = await retrieveDocumentChunks(userId, input, 5);
    const names = new Map(workspaceRecord.agents.map((member) => [member.agent.id, member.agent.name]));
    const runners = workspaceRecord.agents.filter((item) => item.isActive).map((member) => {
      const meta = parseAgentMeta(member.agent.config);
      const agent = { ...mapAgent(member.agent), capabilityIds: meta.capabilityIds };
      return {
        agent,
        invoke: async ({ priorAssistantMessages, signal: runSignal }: { priorAssistantMessages: { agentName: string; content: string }[]; signal: AbortSignal }) => {
          const storedApiKey = member.agent.credential?.isValid
          ? member.agent.credential
          : workspaceRecord.user.apiKeys.find((key) => key.provider === member.agent.provider && key.isValid);
          const apiKey = decryptStoredApiKey(storedApiKey);
          if (agent.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
          return runSingleAgentGraph(
            {
              retrieveContext: async () => agent.capabilityIds?.includes("rag") ? databaseKnowledge : "",
              invokeAgent: async ({ agent: graphAgent, messages }) => callLLMWithApiKey({ agent: graphAgent, messages, apiKey, baseUrl: member.agent.apiUrl || meta.apiUrl, signal: runSignal }),
            },
            {
              agent, input, userId,
              systemContext: [agent.systemPrompt, describeCapabilities(agent.capabilityIds ?? []).map((item) => `- ${item}`).join("\n")].filter(Boolean).join("\n\n"),
              priorAssistantMessages,
            },
          );
        },
      };
    });
    const priorAssistantMessages = snapshot.messages
      .filter((message) => message.role === "assistant")
      .map((message) => ({ agentName: message.agentId ? names.get(message.agentId) ?? message.agentId : "unknown", content: message.content }));

    return await runService({
      runId: handle.runId, startedAt: handle.startedAt, userId, input,
      workspace: snapshot, agents: runners, priorAssistantMessages,
      initialTotalSpent: snapshot.totalSpent, budgetLimit: snapshot.budgetLimit,
      signal: signal ?? new AbortController().signal,
      persistence: handle.persistence, eventSink: onEvent,
    });
  } catch (error) {
    const safeError = toSafeRunError(error);
    try { await handle.failRun(safeError.code); } catch { /* owner-checked stale lock recovery remains available */ }
    throw error;
  }
}
