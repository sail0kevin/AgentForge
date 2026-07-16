import { calculateCost } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { callLLMWithApiKey } from "@/lib/llm/router";
import { mapAgent } from "@/lib/mappers";
import { generateStructuredOutput } from "@/lib/planner/structured-output";
import { decryptStoredApiKey } from "@/lib/security/credentials";
import type { AgentConfig } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";
import { parseAgentMeta } from "@/lib/validation";
import { CandidateSolutionSchema, EvaluationResultSchema, ReviewResultSchema, type ReviewBudget } from "./contracts";
import { buildCandidatePrompt, buildEvaluationPrompt, buildReviewPrompt, buildRevisionPrompt, REVIEW_SYSTEM_RULES } from "./prompts";
import type { ReviewGenerators } from "./review-service";

type RoleIds = { candidateAgentIds: [string, string]; reviewerAgentId: string; evaluatorAgentId: string };
type AgentRecord = NonNullable<Awaited<ReturnType<typeof loadAgent>>>;
type Usage = { agent: AgentConfig; inputTokens: number; outputTokens: number; costUsd: number; costCny: number; stages: string[] };

async function loadAgent(userId: string, id: string) {
  return prisma.agent.findFirst({
    where: { id, userId },
    include: { credential: true, user: { select: { apiKeys: { where: { isValid: true } } } } },
  });
}

/** Creates role-bound model generators while keeping each candidate's input independent. */
export async function createReviewModelContext(input: { userId: string; roles: RoleIds; budget: ReviewBudget; signal: AbortSignal }) {
  const uniqueIds = Array.from(new Set([...input.roles.candidateAgentIds, input.roles.reviewerAgentId, input.roles.evaluatorAgentId]));
  const records = await Promise.all(uniqueIds.map((id) => loadAgent(input.userId, id)));
  if (records.some((record) => !record)) throw new Error("REVIEW_AGENT_NOT_FOUND");
  const byId = new Map(records.map((record) => [record!.id, record!]));
  const usage = new Map<string, Usage>();
  let reservedTokens = 0;
  let reservedCost = 0;

  async function call<T>(record: AgentRecord, stage: string, prompt: string, schema: Parameters<typeof generateStructuredOutput<T>>[0]["schema"]) {
    const meta = parseAgentMeta(record.config);
    const storedCredential = record.credential?.isValid ? record.credential : record.user.apiKeys.find((key) => key.provider === record.provider);
    const apiKey = decryptStoredApiKey(storedCredential);
    if (record.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
    const agent: AgentConfig = { ...mapAgent(record), maxTokens: Math.max(record.maxTokens, 4_000) };

    return generateStructuredOutput({
      schema,
      prompt,
      maxAttempts: 2,
      generate: async (currentPrompt) => {
        const inputEstimate = estimateTokens(`${REVIEW_SYSTEM_RULES}\n${currentPrompt}`);
        const projected = calculateCost(agent.model, inputEstimate, agent.maxTokens);
        const tokenReservation = inputEstimate + agent.maxTokens;
        if (reservedTokens + tokenReservation > input.budget.maxTokens || reservedCost + projected.costUsd > input.budget.maxCostUsd) {
          throw new Error("REVIEW_BUDGET_EXCEEDED");
        }
        reservedTokens += tokenReservation;
        reservedCost += projected.costUsd;
        let reservationActive = true;
        try {
          const result = await callLLMWithApiKey({
            agent,
            messages: [{ role: "system", content: REVIEW_SYSTEM_RULES }, { role: "user", content: currentPrompt }],
            apiKey,
            baseUrl: record.apiUrl || meta.apiUrl,
            signal: input.signal,
          });
          const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
          reservedTokens -= tokenReservation;
          reservedCost -= projected.costUsd;
          reservationActive = false;
          reservedTokens += result.inputTokens + result.outputTokens;
          reservedCost += cost.costUsd;
          const current = usage.get(record.id) ?? { agent, inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0, stages: [] };
          current.inputTokens += result.inputTokens;
          current.outputTokens += result.outputTokens;
          current.costUsd = Number((current.costUsd + cost.costUsd).toFixed(8));
          current.costCny = Number((current.costCny + cost.costCny).toFixed(8));
          current.stages.push(stage);
          usage.set(record.id, current);
          if (reservedTokens > input.budget.maxTokens || reservedCost > input.budget.maxCostUsd) throw new Error("REVIEW_BUDGET_EXCEEDED");
          return result.content;
        } catch (error) {
          // Failed calls have no trustworthy provider usage, so release only the pre-call reservation.
          if (reservationActive) {
            reservedTokens -= tokenReservation;
            reservedCost -= projected.costUsd;
          }
          throw error;
        }
      },
    });
  }

  const candidateByOrientation = {
    delivery: byId.get(input.roles.candidateAgentIds[0])!,
    quality: byId.get(input.roles.candidateAgentIds[1])!,
  };
  const reviewer = byId.get(input.roles.reviewerAgentId)!;
  const evaluator = byId.get(input.roles.evaluatorAgentId)!;

  const generators: ReviewGenerators = {
    candidate: (value) => call(candidateByOrientation[value.orientation], `candidate:${value.orientation}`, buildCandidatePrompt(value), CandidateSolutionSchema),
    review: (value) => call(reviewer, "review", buildReviewPrompt(value), ReviewResultSchema),
    evaluate: (value) => call(evaluator, "evaluate", buildEvaluationPrompt(value), EvaluationResultSchema),
    revise: (value) => call(candidateByOrientation[value.candidate.orientation], `revise:${value.round}`, buildRevisionPrompt(value), CandidateSolutionSchema),
  };

  return { generators, usageRecords: () => Array.from(usage.values()), totalCostUsd: () => Array.from(usage.values()).reduce((sum, item) => sum + item.costUsd, 0) };
}
