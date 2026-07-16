import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import { ExecutionPlanSchema, RequirementAnalysisSchema } from "@/lib/planner/contracts";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { createReviewModelContext } from "@/lib/review/model-generators";
import { mapReviewWorkflow, saveReviewWorkflow } from "@/lib/review/prisma-review";
import { runReviewWorkflow } from "@/lib/review/review-service";
import type { WorkspaceMessage } from "@/lib/types";

export const runtime = "nodejs";

const createReviewSchema = z.object({
  planningArtifactId: z.string().min(1),
  budget: ReviewBudgetSchema.partial().optional(),
  modelAgents: z.object({
    candidateAgentIds: z.tuple([z.string().min(1), z.string().min(1)]),
    reviewerAgentId: z.string().min(1),
    evaluatorAgentId: z.string().min(1),
  }).optional(),
});

const DEFAULT_REVIEW_BUDGET = ReviewBudgetSchema.parse({});

function apiError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("PLANNING_ARTIFACT_NOT_READY")) return { status: 409, code: "PLANNING_ARTIFACT_NOT_READY", message: "The selected plan is not ready for cross-review." };
  if (raw.includes("WORKSPACE_ALREADY_RUNNING")) return { status: 409, code: "REVIEW_ALREADY_RUNNING", message: "Another review is already running for this user." };
  if (raw.includes("REVIEW_AGENT_NOT_FOUND")) return { status: 404, code: "REVIEW_AGENT_NOT_FOUND", message: "One or more review Agents do not belong to the current user." };
  if (raw.includes("REVIEW_BUDGET_EXCEEDED")) return { status: 422, code: "REVIEW_BUDGET_EXCEEDED", message: "The bounded review budget was exhausted." };
  return { status: 500, code: "REVIEW_FAILED", message: "The review workflow stopped safely before producing a trusted result." };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const records = await prisma.reviewWorkflow.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return Response.json({ reviews: records.map(mapReviewWorkflow) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let body: z.infer<typeof createReviewSchema>;
  try {
    body = createReviewSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid review request.";
    return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
  }

  const artifact = await prisma.planningArtifact.findFirst({
    where: { id: body.planningArtifactId, userId: user.id, status: "ready" },
  });
  if (!artifact || !artifact.requirementAnalysis || !artifact.executionPlan) {
    return Response.json({ error: { code: "PLANNING_ARTIFACT_NOT_READY", message: "A ready, user-owned planning artifact is required." } }, { status: 404 });
  }

  let analysis: z.infer<typeof RequirementAnalysisSchema>;
  let plan: z.infer<typeof ExecutionPlanSchema>;
  try {
    analysis = RequirementAnalysisSchema.parse(JSON.parse(artifact.requirementAnalysis));
    plan = ExecutionPlanSchema.parse(JSON.parse(artifact.executionPlan));
  } catch {
    return Response.json({ error: { code: "PLANNING_ARTIFACT_INVALID", message: "The stored plan no longer matches the current contract." } }, { status: 409 });
  }

  const budget = ReviewBudgetSchema.parse({ ...DEFAULT_REVIEW_BUDGET, ...body.budget });
  let modelContext: Awaited<ReturnType<typeof createReviewModelContext>> | null = null;
  if (body.modelAgents) {
    try {
      modelContext = await createReviewModelContext({ userId: user.id, roles: body.modelAgents, budget, signal: request.signal });
    } catch (error) {
      const safe = apiError(error);
      return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
    }
  }
  const workspaceId = `review-run-${user.id}`;
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, userId: user.id, name: "Cross Review", description: "Independent candidates, evidence review, evaluation, and human approval", mode: "parallel", budgetLimit: 9_999 },
  });

  let handle: Awaited<ReturnType<typeof createPrismaRunHandle>> | null = null;
  let completed = false;
  let usageSaved = false;
  try {
    handle = await createPrismaRunHandle({ workspaceId, userId: user.id, runInput: `Review planning artifact ${artifact.id}` });
    const message: WorkspaceMessage = {
      id: crypto.randomUUID(), runId: handle.runId, role: "user",
      content: JSON.stringify({ planningArtifactId: artifact.id, requirement: artifact.requirement }),
      createdAt: new Date().toISOString(),
    };
    await handle.persistence.saveUserMessage(message);

    const result = await runReviewWorkflow({ analysis, plan, budget, generators: modelContext?.generators });
    const record = await saveReviewWorkflow({ runId: handle.runId, planningArtifactId: artifact.id, userId: user.id, budget, result });
    if (modelContext) {
      for (const usage of modelContext.usageRecords()) {
        const assistantMessage: WorkspaceMessage = {
          id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: usage.agent.id,
          content: JSON.stringify({ reviewWorkflowId: record.id, stages: usage.stages }),
          createdAt: new Date().toISOString(),
        };
        await handle.persistence.saveAssistantResult({ message: assistantMessage, ...usage });
      }
      usageSaved = true;
    }
    const warning = result.status === "partial" || result.status === "inconclusive";
    await handle.persistence.completeRun({
      runId: handle.runId,
      totalSpent: modelContext?.totalCostUsd() ?? 0,
      budgetStatus: warning ? "warning" : "idle",
      ...(warning ? { errorCode: result.status === "partial" ? "REVIEW_PARTIAL" : "REVIEW_INCONCLUSIVE" } : {}),
      startedAt: handle.startedAt,
    });
    completed = true;
    return Response.json({ review: mapReviewWorkflow(record), mode: modelContext ? "model" : "baseline" }, { status: result.status === "needs_human" ? 202 : 201 });
  } catch (error) {
    const safe = apiError(error);
    if (handle && !completed) {
      try {
        if (modelContext && !usageSaved) {
          for (const usage of modelContext.usageRecords()) {
            const rejectedMessage: WorkspaceMessage = {
              id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: usage.agent.id,
              content: JSON.stringify({ stages: usage.stages, status: "rejected", code: safe.code }), createdAt: new Date().toISOString(),
            };
            await handle.persistence.saveAssistantResult({ message: rejectedMessage, ...usage });
          }
          await handle.persistence.updateProgress(modelContext.totalCostUsd(), "warning");
          usageSaved = true;
        }
        await handle.failRun(safe.code);
      } catch { /* preserve the original safe error */ }
    }
    return Response.json({ error: { code: safe.code, message: safe.message }, runId: handle?.runId }, { status: safe.status });
  }
}
