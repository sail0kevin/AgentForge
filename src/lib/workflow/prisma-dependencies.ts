import "server-only";
import { prisma } from "@/lib/db";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import { ExecutionPlanSchema, RequirementAnalysisSchema } from "@/lib/planner/contracts";
import { createPlannerModelContext } from "@/lib/planner/model-generator";
import { DEFAULT_PLANNER_BUDGET, planRequirement } from "@/lib/planner/planner-service";
import { savePlanningArtifact, savePlanningFailure } from "@/lib/planner/prisma-planning";
import { ReportBudgetSchema } from "@/lib/report/contracts";
import { createReportModelContext } from "@/lib/report/model-generator";
import { createBaselineDevelopmentReport } from "@/lib/report/report-service";
import { loadReportGenerationInput, saveReportArtifact } from "@/lib/report/prisma-report";
import { createProductUIReportGroup } from "@/lib/report/product-ui-report";
import { saveProductUIReportGroup } from "@/lib/report/product-ui-group-service";
import { ReviewBudgetSchema, type ApprovalDecision } from "@/lib/review/contracts";
import { createReviewModelContext } from "@/lib/review/model-generators";
import { decideReviewWorkflow, saveReviewWorkflow } from "@/lib/review/prisma-review";
import { runReviewWorkflow } from "@/lib/review/review-service";
import type { WorkspaceMessage } from "@/lib/types";
import type { WorkflowAgentConfig } from "./contracts";
import type { ProductWorkflowDependencies } from "./product-graph";

const REVIEW_BUDGET = ReviewBudgetSchema.parse({});
const REPORT_BUDGET = ReportBudgetSchema.parse({});

type WorkflowDependencyOptions = {
  mode: "baseline" | "model";
  agents: WorkflowAgentConfig;
  signal: AbortSignal;
};

async function ensureWorkflowWorkspace(userId: string) {
  const id = `development-workflow-${userId}`;
  await prisma.workspace.upsert({
    where: { id },
    update: {},
    create: {
      id,
      userId,
      name: "Development Workflow",
      description: "Checkpointed requirement planning, review, approval, and report generation",
      mode: "sequential",
      budgetLimit: 9_999,
    },
  });
  return id;
}

async function createRun(userId: string, input: string) {
  const workspaceId = await ensureWorkflowWorkspace(userId);
  const handle = await createPrismaRunHandle({ workspaceId, userId, runInput: input });
  const message: WorkspaceMessage = {
    id: crypto.randomUUID(),
    runId: handle.runId,
    role: "user",
    content: input,
    createdAt: new Date().toISOString(),
  };
  await handle.persistence.saveUserMessage(message);
  return handle;
}

function approvalDecision(decision: "delivery" | "quality" | "hybrid" | "reject"): ApprovalDecision {
  if (decision === "delivery") return "approve_delivery";
  if (decision === "quality") return "approve_quality";
  return decision;
}

function requireModelRoles(agents: WorkflowAgentConfig) {
  if (!agents.plannerAgentId || !agents.candidateAgentIds || !agents.reviewerAgentId || !agents.evaluatorAgentId || !agents.reporterAgentId) {
    throw new Error("WORKFLOW_MODEL_AGENTS_INCOMPLETE");
  }
  return {
    plannerAgentId: agents.plannerAgentId,
    candidateAgentIds: agents.candidateAgentIds,
    reviewerAgentId: agents.reviewerAgentId,
    evaluatorAgentId: agents.evaluatorAgentId,
    reporterAgentId: agents.reporterAgentId,
  };
}

/**
 * Binds the product graph to durable Prisma artifacts. Baseline and model mode
 * share the same contracts and idempotency keys; only the generators differ.
 */
export function createPrismaWorkflowDependencies(options: WorkflowDependencyOptions): ProductWorkflowDependencies {
  return {
    async plan(input) {
      const existing = await prisma.planningArtifact.findUnique({ where: { workflowNodeKey: input.nodeKey } });
      if (existing) {
        if (existing.userId !== input.userId) throw new Error("WORKFLOW_NODE_KEY_CONFLICT");
        const clarification = existing.clarification ? JSON.parse(existing.clarification) as { questions?: Array<{ question?: string }> } : null;
        return {
          planningArtifactId: existing.id,
          status: existing.status as "ready" | "needs_clarification" | "failed",
          questions: clarification?.questions?.map((item) => item.question ?? "").filter(Boolean) ?? [],
        };
      }

      const roles = options.mode === "model" ? requireModelRoles(options.agents) : null;
      const model = roles
        ? await createPlannerModelContext({ userId: input.userId, plannerAgentId: roles.plannerAgentId, budget: DEFAULT_PLANNER_BUDGET, signal: options.signal })
        : null;
      const handle = await createRun(input.userId, input.requirement);
      let usageSaved = false;
      try {
        const result = await planRequirement({
          requirement: input.requirement,
          budget: DEFAULT_PLANNER_BUDGET,
          generate: model?.generate,
          maxAttempts: 2,
        });
        const artifact = await savePlanningArtifact({
          runId: handle.runId,
          userId: input.userId,
          requirement: input.requirement,
          plannerAgentId: model?.agent.id,
          budget: DEFAULT_PLANNER_BUDGET,
          workflowNodeKey: input.nodeKey,
          result,
        });
        if (model && model.usage.inputTokens + model.usage.outputTokens > 0) {
          const message: WorkspaceMessage = {
            id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.agent.id,
            content: JSON.stringify(result), createdAt: new Date().toISOString(),
          };
          await handle.persistence.saveAssistantResult({ message, agent: model.agent, ...model.usage });
          usageSaved = true;
        }
        await handle.persistence.completeRun({ runId: handle.runId, totalSpent: model?.usage.costUsd ?? 0, budgetStatus: "idle", startedAt: handle.startedAt });
        return {
          planningArtifactId: artifact.id,
          status: result.status,
          questions: result.status === "needs_clarification" ? result.clarification.questions.map((item) => item.question) : [],
        };
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_PLANNING_FAILED";
        try {
          if (model && model.usage.inputTokens + model.usage.outputTokens > 0 && !usageSaved) {
            const message: WorkspaceMessage = {
              id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.agent.id,
              content: JSON.stringify({ status: "rejected", code }), createdAt: new Date().toISOString(),
            };
            await handle.persistence.saveAssistantResult({ message, agent: model.agent, ...model.usage });
            await handle.persistence.updateProgress(model.usage.costUsd, "warning");
            usageSaved = true;
          }
          await savePlanningFailure({
            runId: handle.runId,
            userId: input.userId,
            requirement: input.requirement,
            plannerAgentId: model?.agent.id,
            budget: DEFAULT_PLANNER_BUDGET,
            workflowNodeKey: input.nodeKey,
            failureCode: code,
          });
        } catch { /* Preserve the original workflow error. */ }
        try { await handle.failRun(code); } catch { /* Preserve the original workflow error. */ }
        throw error;
      }
    },

    async review(input) {
      const existing = await prisma.reviewWorkflow.findUnique({ where: { workflowNodeKey: input.nodeKey } });
      if (existing) {
        if (existing.userId !== input.userId) throw new Error("WORKFLOW_NODE_KEY_CONFLICT");
        return { reviewWorkflowId: existing.id, status: existing.status as "approved" | "partial" | "needs_human" | "inconclusive" };
      }
      const artifact = await prisma.planningArtifact.findFirst({ where: { id: input.planningArtifactId, userId: input.userId, status: "ready" } });
      if (!artifact?.requirementAnalysis || !artifact.executionPlan) throw new Error("PLANNING_ARTIFACT_NOT_READY");
      const analysis = RequirementAnalysisSchema.parse(JSON.parse(artifact.requirementAnalysis));
      const plan = ExecutionPlanSchema.parse(JSON.parse(artifact.executionPlan));

      // 从 PlanningArtifact 读取复杂度评分和推荐候选数
      const complexityScore = artifact.complexityScore ?? undefined;
      const recommendedCandidates = artifact.recommendedCandidates as 1 | 2 | null;

      // 动态调整 Review 预算的候选数量
      const reviewBudget = ReviewBudgetSchema.parse({
        ...REVIEW_BUDGET,
        maxCandidates: recommendedCandidates ?? REVIEW_BUDGET.maxCandidates,
      });

      const roles = options.mode === "model" ? requireModelRoles(options.agents) : null;
      const model = roles
        ? await createReviewModelContext({
            userId: input.userId,
            roles: {
              candidateAgentIds: roles.candidateAgentIds,
              reviewerAgentId: roles.reviewerAgentId,
              evaluatorAgentId: roles.evaluatorAgentId,
            },
            budget: reviewBudget,
            signal: options.signal,
          })
        : null;
      const handle = await createRun(input.userId, `Review planning artifact ${artifact.id}`);
      let usageSaved = false;
      try {
        const result = await runReviewWorkflow({ analysis, plan, budget: reviewBudget, generators: model?.generators });
        const record = await saveReviewWorkflow({
          runId: handle.runId,
          planningArtifactId: artifact.id,
          userId: input.userId,
          budget: reviewBudget,
          workflowNodeKey: input.nodeKey,
          result,
        });
        if (model) {
          for (const usage of model.usageRecords()) {
            const message: WorkspaceMessage = {
              id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: usage.agent.id,
              content: JSON.stringify({ reviewWorkflowId: record.id, stages: usage.stages }), createdAt: new Date().toISOString(),
            };
            await handle.persistence.saveAssistantResult({ message, ...usage });
          }
          usageSaved = true;
        }
        const warning = result.status === "partial" || result.status === "inconclusive";
        await handle.persistence.completeRun({ runId: handle.runId, totalSpent: model?.totalCostUsd() ?? 0, budgetStatus: warning ? "warning" : "idle", ...(warning ? { errorCode: `REVIEW_${result.status.toUpperCase()}` } : {}), startedAt: handle.startedAt });
        return { reviewWorkflowId: record.id, status: result.status };
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_REVIEW_FAILED";
        try {
          if (model && !usageSaved) {
            for (const usage of model.usageRecords()) {
              const message: WorkspaceMessage = {
                id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: usage.agent.id,
                content: JSON.stringify({ stages: usage.stages, status: "rejected", code }), createdAt: new Date().toISOString(),
              };
              await handle.persistence.saveAssistantResult({ message, ...usage });
            }
            await handle.persistence.updateProgress(model.totalCostUsd(), "warning");
            usageSaved = true;
          }
        } catch { /* Preserve the original workflow error. */ }
        try { await handle.failRun(code); } catch { /* Preserve the original workflow error. */ }
        throw error;
      }
    },

    async approve(input) {
      await decideReviewWorkflow({
        id: input.reviewWorkflowId,
        userId: input.userId,
        decision: approvalDecision(input.decision),
        note: input.note,
        taskPatch: input.taskPatch,
      });
    },

    async report(input) {
      const existing = await prisma.reportArtifact.findFirst({ where: { userId: input.userId, generationKey: input.generationKey } });
      if (existing && existing.reviewWorkflowId !== input.reviewWorkflowId) throw new Error("WORKFLOW_REPORT_KEY_CONFLICT");
      const productUIGroupId = `product-ui-group:${input.workflowId}:1`;
      const existingProductUIGroup = await prisma.productUIReportGroup.findUnique({
        where: { userId_groupId: { userId: input.userId, groupId: productUIGroupId } },
      });
      if (existing && existingProductUIGroup) {
        return {
          reportArtifactId: existing.id,
          productUIReportGroupId: existingProductUIGroup.id,
          status: existing.status as "completed" | "partial" | "blocked" | "inconclusive",
        };
      }
      const source = await loadReportGenerationInput(input.reviewWorkflowId, input.userId);
      const roles = options.mode === "model" ? requireModelRoles(options.agents) : null;
      const model = roles
        ? await createReportModelContext({ userId: input.userId, reporterAgentId: roles.reporterAgentId, budget: REPORT_BUDGET, signal: options.signal })
        : null;
      const handle = await createRun(input.userId, `Generate report for review ${input.reviewWorkflowId}`);
      let usageSaved = false;
      try {
        const report = model ? await model.generate(source) : createBaselineDevelopmentReport(source);
        const artifact = existing
          ? existing
          : await saveReportArtifact({ runId: handle.runId, userId: input.userId, generationKey: input.generationKey, source, report });
        // 当前三套产品/UI方案采用确定性 Baseline 模板，确保结构完整且结果可复现；
        // 后续接入模型 Reporter 时再替换各方案的生成器，并保留同一持久化契约。
        const productUIGroup = createProductUIReportGroup(source, { groupId: productUIGroupId });
        const savedProductUIGroup = await saveProductUIReportGroup({ userId: input.userId, reviewWorkflowId: input.reviewWorkflowId, group: productUIGroup });
        if (model && model.usage.attempts > 0) {
          const message: WorkspaceMessage = {
            id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.usage.agent.id,
            content: JSON.stringify({ reportArtifactId: artifact.id, productUIReportGroupId: savedProductUIGroup.record.id, attempts: model.usage.attempts, status: "accepted" }), createdAt: new Date().toISOString(),
          };
          await handle.persistence.saveAssistantResult({ message, ...model.usage });
          usageSaved = true;
        }
        const warning = report.status !== "completed";
        await handle.persistence.completeRun({ runId: handle.runId, totalSpent: model?.usage.costUsd ?? 0, budgetStatus: warning ? "warning" : "idle", ...(warning ? { errorCode: `REPORT_${report.status.toUpperCase()}` } : {}), startedAt: handle.startedAt });
        return { reportArtifactId: artifact.id, productUIReportGroupId: savedProductUIGroup.record.id, status: report.status };
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_REPORT_FAILED";
        try {
          if (model && model.usage.attempts > 0 && !usageSaved) {
            const message: WorkspaceMessage = {
              id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: model.usage.agent.id,
              content: JSON.stringify({ attempts: model.usage.attempts, status: "rejected", code }), createdAt: new Date().toISOString(),
            };
            await handle.persistence.saveAssistantResult({ message, ...model.usage });
            await handle.persistence.updateProgress(model.usage.costUsd, "warning");
            usageSaved = true;
          }
        } catch { /* Preserve the original workflow error. */ }
        try { await handle.failRun(code); } catch { /* Preserve the original workflow error. */ }
        throw error;
      }
    },
  };
}

/** Backward-compatible deterministic factory used by focused graph integrations. */
export function createBaselinePrismaWorkflowDependencies(signal = new AbortController().signal) {
  return createPrismaWorkflowDependencies({ mode: "baseline", agents: {}, signal });
}
