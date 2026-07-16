import { prisma } from "@/lib/db";
import type { BudgetState } from "./contracts";
import type { PlannerResult } from "./planner-service";

type ArtifactIdentity = {
  runId: string;
  userId: string;
  requirement: string;
  plannerAgentId?: string;
  budget: BudgetState;
  workflowNodeKey?: string;
};

async function assertOwnedRun(runId: string, userId: string) {
  const run = await prisma.run.findFirst({ where: { id: runId, userId }, select: { id: true } });
  if (!run) throw new Error("RUN_NOT_FOUND");
}

/** 将需求分析、计划和动态目录绑定到同一个已认证用户的 Run。 */
export async function savePlanningArtifact(input: ArtifactIdentity & { result: PlannerResult }) {
  await assertOwnedRun(input.runId, input.userId);
  return prisma.planningArtifact.upsert({
    where: { runId: input.runId },
    update: {
      status: input.result.status,
      requirementAnalysis: JSON.stringify(input.result.analysis),
      executionPlan: input.result.status === "ready" ? JSON.stringify(input.result.plan) : null,
      reportOutline: input.result.status === "ready" ? JSON.stringify(input.result.reportOutline) : null,
      clarification: input.result.status === "needs_clarification" ? JSON.stringify(input.result.clarification) : null,
      failureCode: null,
      workflowNodeKey: input.workflowNodeKey,
    },
    create: {
      runId: input.runId,
      userId: input.userId,
      plannerAgentId: input.plannerAgentId,
      status: input.result.status,
      requirement: input.requirement,
      requirementAnalysis: JSON.stringify(input.result.analysis),
      executionPlan: input.result.status === "ready" ? JSON.stringify(input.result.plan) : null,
      reportOutline: input.result.status === "ready" ? JSON.stringify(input.result.reportOutline) : null,
      clarification: input.result.status === "needs_clarification" ? JSON.stringify(input.result.clarification) : null,
      budgetState: JSON.stringify(input.budget),
      schemaVersion: 1,
      workflowNodeKey: input.workflowNodeKey,
    },
  });
}

export async function savePlanningFailure(input: ArtifactIdentity & { failureCode: string }) {
  await assertOwnedRun(input.runId, input.userId);
  return prisma.planningArtifact.upsert({
    where: { runId: input.runId },
    update: { status: "failed", failureCode: input.failureCode },
    create: {
      runId: input.runId,
      userId: input.userId,
      plannerAgentId: input.plannerAgentId,
      status: "failed",
      requirement: input.requirement,
      failureCode: input.failureCode,
      budgetState: JSON.stringify(input.budget),
      schemaVersion: 1,
      workflowNodeKey: input.workflowNodeKey,
    },
  });
}

function parseJson(value: string | null) {
  return value ? JSON.parse(value) as unknown : null;
}

export function mapPlanningArtifact(record: {
  id: string; runId: string; status: string; requirement: string; requirementAnalysis: string | null;
  executionPlan: string | null; reportOutline: string | null; clarification: string | null;
  budgetState: string; failureCode: string | null; schemaVersion: number; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: record.id,
    runId: record.runId,
    status: record.status,
    requirement: record.requirement,
    analysis: parseJson(record.requirementAnalysis),
    plan: parseJson(record.executionPlan),
    reportOutline: parseJson(record.reportOutline),
    clarification: parseJson(record.clarification),
    budget: parseJson(record.budgetState),
    failureCode: record.failureCode,
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
