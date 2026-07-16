import "server-only";
import { calculateCost } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { callLLMWithApiKey } from "@/lib/llm/router";
import { mapAgent } from "@/lib/mappers";
import { decryptStoredApiKey } from "@/lib/security/credentials";
import type { AgentConfig } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";
import { parseAgentMeta } from "@/lib/validation";
import type { BudgetState } from "./contracts";
import type { PlannerGenerate } from "./planner-service";
import { PLANNER_SYSTEM_RULES } from "./prompts";

export type PlannerModelUsage = { inputTokens: number; outputTokens: number; costUsd: number; costCny: number };

async function loadPlannerAgent(userId: string, plannerAgentId: string) {
  return prisma.agent.findFirst({
    where: { id: plannerAgentId, userId },
    include: { credential: true, user: { select: { apiKeys: { where: { isValid: true } } } } },
  });
}

export async function createPlannerModelContext(input: {
  userId: string;
  plannerAgentId: string;
  budget: BudgetState;
  signal: AbortSignal;
}) {
  const record = await loadPlannerAgent(input.userId, input.plannerAgentId);
  if (!record) throw new Error("PLANNER_AGENT_NOT_FOUND");
  const meta = parseAgentMeta(record.config);
  const storedCredential = record.credential?.isValid
    ? record.credential
    : record.user.apiKeys.find((key) => key.provider === record.provider);
  const apiKey = decryptStoredApiKey(storedCredential);
  if (record.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
  const agent: AgentConfig = { ...mapAgent(record), maxTokens: Math.max(record.maxTokens, 4_000) };
  const usage: PlannerModelUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0 };
  const generate: PlannerGenerate = async ({ stage, prompt }) => {
    const systemPrompt = `${agent.systemPrompt}\n\n${PLANNER_SYSTEM_RULES}\n当前节点：${stage}`;
    const projected = calculateCost(agent.model, estimateTokens(`${systemPrompt}\n${prompt}`), agent.maxTokens);
    if (usage.costUsd + projected.costUsd > input.budget.maxCostUsd) throw new Error("PLANNER_BUDGET_EXCEEDED");
    const result = await callLLMWithApiKey({
      agent,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      apiKey,
      baseUrl: record.apiUrl || meta.apiUrl,
      signal: input.signal,
    });
    const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
    usage.inputTokens += result.inputTokens;
    usage.outputTokens += result.outputTokens;
    usage.costUsd = Number((usage.costUsd + cost.costUsd).toFixed(8));
    usage.costCny = Number((usage.costCny + cost.costCny).toFixed(8));
    if (usage.costUsd > input.budget.maxCostUsd) throw new Error("PLANNER_BUDGET_EXCEEDED");
    return result.content;
  };
  return { agent, generate, usage };
}
