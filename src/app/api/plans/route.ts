import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import { toSafeRunError } from "@/lib/errors/run-error";
import { BudgetStateSchema } from "@/lib/planner/contracts";
import { createPlannerModelContext } from "@/lib/planner/model-generator";
import { DEFAULT_PLANNER_BUDGET, planRequirement } from "@/lib/planner/planner-service";
import { mapPlanningArtifact, savePlanningArtifact, savePlanningFailure } from "@/lib/planner/prisma-planning";
import { StructuredOutputError } from "@/lib/planner/structured-output";
import type { WorkspaceMessage } from "@/lib/types";

export const runtime = "nodejs";

const planRequestSchema = z.object({
  requirement: z.string().trim().min(1).max(20_000),
  plannerAgentId: z.string().min(1).optional(),
  budget: BudgetStateSchema.optional(),
});

function plannerError(error: unknown) {
  if (error instanceof StructuredOutputError) {
    return { code: error.code, message: "模型连续输出了不符合规划契约的内容，已停止重试。", status: 422, issues: error.issues };
  }
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("PLAN_VALIDATION_FAILED")) return { code: "PLAN_VALIDATION_FAILED", message: "计划未通过服务端安全与预算校验。", status: 422 };
  if (raw.includes("PLANNER_BUDGET_EXCEEDED")) return { code: "PLANNER_BUDGET_EXCEEDED", message: "规划模型调用会超过本次预算，已在调用前停止。", status: 422 };
  if (raw.includes("PLANNER_AGENT_NOT_FOUND")) return { code: "PLANNER_AGENT_NOT_FOUND", message: "Planner Agent not found.", status: 404 };
  const safe = toSafeRunError(error);
  return { ...safe, status: 500 };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const records = await prisma.planningArtifact.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return Response.json({ plans: records.map(mapPlanningArtifact) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let body: z.infer<typeof planRequestSchema>;
  try {
    body = planRequestSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid planning request.";
    return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
  }

  const budget = body.budget ?? DEFAULT_PLANNER_BUDGET;
  let model: Awaited<ReturnType<typeof createPlannerModelContext>> | null = null;
  if (body.plannerAgentId) {
    try { model = await createPlannerModelContext({ userId: user.id, plannerAgentId: body.plannerAgentId, budget, signal: request.signal }); }
    catch (error) { const safe = plannerError(error); return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
  }

  const workspaceId = `planner-run-${user.id}`;
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, userId: user.id, name: "Requirement Planner", description: "Structured requirement analysis and report planning", mode: "sequential", budgetLimit: 9_999 },
  });

  let handle: Awaited<ReturnType<typeof createPrismaRunHandle>> | null = null;
  let completed = false;
  let usageSaved = false;
  try {
    handle = await createPrismaRunHandle({ workspaceId, userId: user.id, runInput: body.requirement });
    const userMessage: WorkspaceMessage = { id: crypto.randomUUID(), runId: handle.runId, role: "user", content: body.requirement, createdAt: new Date().toISOString() };
    await handle.persistence.saveUserMessage(userMessage);

    const result = await planRequirement({ requirement: body.requirement, budget, generate: model?.generate, maxAttempts: 2 });
    await savePlanningArtifact({ runId: handle.runId, userId: user.id, requirement: body.requirement, plannerAgentId: model?.agent.id, budget, result });

    if (model && model.usage.inputTokens + model.usage.outputTokens > 0) {
      const message: WorkspaceMessage = { id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.agent.id, content: JSON.stringify(result), createdAt: new Date().toISOString() };
      await handle.persistence.saveAssistantResult({ message, agent: model.agent, ...model.usage });
      usageSaved = true;
    }
    const finishedAt = await handle.persistence.completeRun({ runId: handle.runId, totalSpent: model?.usage.costUsd ?? 0, budgetStatus: "idle", startedAt: handle.startedAt });
    completed = true;
    return Response.json({ runId: handle.runId, finishedAt, mode: model ? "model" : "baseline", ...result }, { status: result.status === "needs_clarification" ? 202 : 201 });
  } catch (error) {
    const safe = plannerError(error);
    if (handle && !completed) {
      try {
        if (model && model.usage.inputTokens + model.usage.outputTokens > 0 && !usageSaved) {
          const rejectedMessage: WorkspaceMessage = {
            id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.agent.id,
            content: JSON.stringify({ status: "rejected", code: safe.code }), createdAt: new Date().toISOString(),
          };
          await handle.persistence.saveAssistantResult({ message: rejectedMessage, agent: model.agent, ...model.usage });
          await handle.persistence.updateProgress(model.usage.costUsd, "warning");
          usageSaved = true;
        }
        await savePlanningFailure({ runId: handle.runId, userId: user.id, requirement: body.requirement, plannerAgentId: model?.agent.id, budget, failureCode: safe.code });
        await handle.failRun(safe.code);
      } catch {
        // 原始安全错误优先返回；activeRunId 所有权校验可避免释放其他运行。
      }
    }
    return Response.json({ error: { code: safe.code, message: safe.message, ...(safe.issues ? { issues: safe.issues } : {}) }, runId: handle?.runId }, { status: safe.status });
  }
}
