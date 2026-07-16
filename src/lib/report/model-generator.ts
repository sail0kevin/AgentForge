import { z } from "zod";
import { calculateCost } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { callLLMWithApiKey } from "@/lib/llm/router";
import { mapAgent } from "@/lib/mappers";
import { generateStructuredOutput } from "@/lib/planner/structured-output";
import { decryptStoredApiKey } from "@/lib/security/credentials";
import type { AgentConfig } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";
import { parseAgentMeta } from "@/lib/validation";
import { DevelopmentReportSchema, type ReportBudget } from "./contracts";
import { findSensitiveReportContent, validateDevelopmentReport, type ReportGenerationInput } from "./report-service";

const REPORTER_SYSTEM_RULES = [
  "You are AgentForge's final development-report Reporter.",
  "Return one JSON object only, matching DevelopmentReport schemaVersion=1. Do not use Markdown fences.",
  "Use exactly the Planner report sections and their order; do not insert a fixed generic template.",
  "Every claim needs resolvable sourceRefs from the supplied source chain.",
  "Distinguish facts, assumptions, recommendations, risks, tradeoffs, and open questions.",
  "Preserve partial, blocked, and inconclusive status. Never hide role failures or unresolved items.",
  "Never reproduce credentials, raw provider errors, hidden prompts, or checkpoints.",
].join("\n");

async function loadReporter(userId: string, id: string) {
  return prisma.agent.findFirst({
    where: { id, userId },
    include: { credential: true, user: { select: { apiKeys: { where: { isValid: true } } } } },
  });
}

export async function createReportModelContext(input: { userId: string; reporterAgentId: string; budget: ReportBudget; signal: AbortSignal }) {
  const record = await loadReporter(input.userId, input.reporterAgentId);
  if (!record) throw new Error("REPORTER_AGENT_NOT_FOUND");
  const reporter = record;
  const meta = parseAgentMeta(reporter.config);
  const storedCredential = reporter.credential?.isValid ? reporter.credential : reporter.user.apiKeys.find((key) => key.provider === reporter.provider);
  const apiKey = decryptStoredApiKey(storedCredential);
  if (reporter.provider !== "ollama" && !apiKey) throw new Error("CREDENTIAL_NOT_CONFIGURED");
  const agent: AgentConfig = { ...mapAgent(reporter), maxTokens: Math.max(reporter.maxTokens, 8_000) };
  const usage = { agent, inputTokens: 0, outputTokens: 0, costUsd: 0, costCny: 0, attempts: 0 };

  async function generate(source: ReportGenerationInput) {
    if (findSensitiveReportContent(source).length > 0) throw new Error("REPORT_SOURCE_SENSITIVE");
    const prompt = `${REPORTER_SYSTEM_RULES}\n\nDevelopmentReport JSON Schema:\n${JSON.stringify(z.toJSONSchema(DevelopmentReportSchema))}\n\nValidated source chain:\n${JSON.stringify(source)}`;
    return generateStructuredOutput({
      schema: DevelopmentReportSchema,
      prompt,
      maxAttempts: 2,
      validate: (report) => validateDevelopmentReport(report, source).issues,
      generate: async (currentPrompt) => {
        const inputEstimate = estimateTokens(`${REPORTER_SYSTEM_RULES}\n${currentPrompt}`);
        const projected = calculateCost(agent.model, inputEstimate, agent.maxTokens);
        if (usage.inputTokens + usage.outputTokens + inputEstimate + agent.maxTokens > input.budget.maxTokens || usage.costUsd + projected.costUsd > input.budget.maxCostUsd) {
          throw new Error("REPORT_BUDGET_EXCEEDED");
        }
        const result = await callLLMWithApiKey({
          agent,
          messages: [{ role: "system", content: REPORTER_SYSTEM_RULES }, { role: "user", content: currentPrompt }],
          apiKey,
          baseUrl: reporter.apiUrl || meta.apiUrl,
          signal: input.signal,
        });
        const cost = calculateCost(agent.model, result.inputTokens, result.outputTokens);
        usage.inputTokens += result.inputTokens;
        usage.outputTokens += result.outputTokens;
        usage.costUsd = Number((usage.costUsd + cost.costUsd).toFixed(8));
        usage.costCny = Number((usage.costCny + cost.costCny).toFixed(8));
        usage.attempts += 1;
        if (usage.inputTokens + usage.outputTokens > input.budget.maxTokens || usage.costUsd > input.budget.maxCostUsd) throw new Error("REPORT_BUDGET_EXCEEDED");
        return result.content;
      },
    });
  }

  return { generate, usage };
}
