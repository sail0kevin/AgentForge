import "server-only";
import { prisma } from "@/lib/db";
import { ExecutionPlanSchema } from "@/lib/planner/contracts";
import { EvaluationResultSchema } from "@/lib/review/contracts";
import { getWorkflowCheckpointer } from "./checkpointer";
import {
  WORKFLOW_NODES,
  WorkflowAgentConfigSchema,
  WorkflowModeSchema,
  WorkflowResumeSchema,
  type WorkflowAgentConfig,
  type WorkflowMode,
  type WorkflowNodeKey,
  type WorkflowNodeStatus,
  type WorkflowResume,
  type WorkflowStatus,
} from "./contracts";
import { continueProductWorkflow, createProductWorkflowGraph, resumeProductWorkflow, startProductWorkflow, type ProductWorkflowStateType } from "./product-graph";
import { createPrismaWorkflowDependencies } from "./prisma-dependencies";
import type { WorkflowLease } from "./workflow-lease";
import { runWithLeaseRenewal } from "./lease-renewal";
import { claimExpiredWorkflowLease, renewActiveWorkflowLease, writeFencedWorkflowState } from "./workflow-lease-store";

// A top-level LangGraph thread uses the empty namespace; non-empty namespaces
// are reserved for subgraphs. The stable threadId is the durable resume cursor.
export const WORKFLOW_CHECKPOINT_NAMESPACE = "";
const WORKFLOW_LEASE_MS = 30 * 60 * 1000;
const WORKFLOW_LEASE_RENEW_INTERVAL_MS = 10 * 60 * 1000;

// 每个应用实例需要稳定的身份；部署时应显式配置，开发环境使用进程级回退值。
const workflowInstanceId = process.env.WORKFLOW_INSTANCE_ID || `local-${process.pid}`;

function newLease(record: { leaseToken: number }): WorkflowLease {
  return {
    ownerId: workflowInstanceId,
    token: record.leaseToken + 1,
    expiresAt: new Date(Date.now() + WORKFLOW_LEASE_MS),
  };
}

async function renewWorkflowLease(workflowId: string, lease: Pick<WorkflowLease, "ownerId" | "token">) {
  const now = new Date();
  // 复用共享操作，跨进程测试与生产服务执行完全相同的 fencing 条件。
  const renewed = await renewActiveWorkflowLease({
    workflows: prisma.developmentWorkflow,
    workflowId,
    lease,
    now,
    durationMs: WORKFLOW_LEASE_MS,
  });
  return renewed.count === 1;
}

type InterruptPayload =
  | { kind: "clarification"; workflowId: string; questions: string[]; round: number; maxRounds: number }
  | { kind: "approval"; workflowId: string; reviewWorkflowId: string; decisions: string[] };

const workflowInclude = {
  nodes: { orderBy: { sortOrder: "asc" as const } },
  planningArtifact: { select: { id: true, status: true, executionPlan: true, createdAt: true } },
  reviewWorkflow: { select: { id: true, status: true, approvalStatus: true, approvalDecision: true, evaluationJson: true, createdAt: true } },
  reportArtifact: { select: { id: true, status: true, version: true, title: true, createdAt: true } },
  productUIReportGroup: { select: { id: true, groupId: true, status: true, schemaVersion: true, createdAt: true, updatedAt: true } },
};

function parseInterrupt(value: string | null): InterruptPayload | null {
  if (!value) return null;
  try { return JSON.parse(value) as InterruptPayload; } catch { return null; }
}

function parseAgentConfig(value: string) {
  try { return WorkflowAgentConfigSchema.parse(JSON.parse(value)); }
  catch { return {}; }
}

function planTaskSummary(value: string | null) {
  if (!value) return null;
  try {
    const plan = ExecutionPlanSchema.parse(JSON.parse(value));
    // 仅提供审批页面编辑所需的任务字段，不将完整规划 Artifact 暴露给浏览器。
    return plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      agentRole: task.agentRole,
      dependsOn: task.dependsOn,
      toolIds: task.toolIds,
      estimatedTokens: task.estimatedTokens,
    }));
  } catch {
    return null;
  }
}

function reviewInterventionSummary(value: string | null) {
  if (!value) return null;
  try {
    const assessment = EvaluationResultSchema.parse(JSON.parse(value)).policyConfidence;
    if (!assessment) return null;
    // 审批页只需要策略信号和可解释原因，避免把完整评审内容下发到浏览器。
    return {
      kind: assessment.kind,
      score: assessment.score,
      level: assessment.level,
      intervention: assessment.intervention,
      hardHumanGate: assessment.hardHumanGate,
      reasons: assessment.reasons,
    };
  } catch {
    return null;
  }
}

export function mapDevelopmentWorkflow(record: Awaited<ReturnType<typeof loadDevelopmentWorkflowRecord>>) {
  if (!record) throw new Error("WORKFLOW_NOT_FOUND");
  return {
    id: record.id,
    threadId: record.threadId,
    status: record.status,
    currentNode: record.currentNode,
    requirement: record.requirement,
    mode: record.mode,
    agents: parseAgentConfig(record.agentConfigJson),
    nodes: record.nodes.map((node) => ({
      key: node.nodeKey,
      order: node.sortOrder,
      status: node.status,
      attempt: node.attempt,
      artifactType: node.artifactType,
      artifactId: node.artifactId,
      summary: node.summary,
      errorCode: node.errorCode,
      startedAt: node.startedAt?.toISOString() ?? null,
      finishedAt: node.finishedAt?.toISOString() ?? null,
    })),
    interrupt: parseInterrupt(record.interruptJson),
    artifacts: {
      plan: record.planningArtifact ? {
        id: record.planningArtifact.id,
        status: record.planningArtifact.status,
        tasks: planTaskSummary(record.planningArtifact.executionPlan),
        createdAt: record.planningArtifact.createdAt.toISOString(),
      } : null,
      review: record.reviewWorkflow ? {
        id: record.reviewWorkflow.id,
        status: record.reviewWorkflow.status,
        approvalStatus: record.reviewWorkflow.approvalStatus,
        approvalDecision: record.reviewWorkflow.approvalDecision,
        intervention: reviewInterventionSummary(record.reviewWorkflow.evaluationJson),
        createdAt: record.reviewWorkflow.createdAt.toISOString(),
      } : null,
      report: record.reportArtifact ? { ...record.reportArtifact, createdAt: record.reportArtifact.createdAt.toISOString() } : null,
      productUI: record.productUIReportGroup ? {
        id: record.productUIReportGroup.id,
        groupId: record.productUIReportGroup.groupId,
        status: record.productUIReportGroup.status,
        schemaVersion: record.productUIReportGroup.schemaVersion,
        createdAt: record.productUIReportGroup.createdAt.toISOString(),
        updatedAt: record.productUIReportGroup.updatedAt.toISOString(),
      } : null,
    },
    checkpoint: record.checkpointId ? { id: record.checkpointId, namespace: record.checkpointNamespace } : null,
    lastErrorCode: record.lastErrorCode,
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    leaseOwnerId: record.leaseOwnerId,
    leaseToken: record.leaseToken,
    recoveryAvailable: (record.status === "failed" && Boolean(record.lastErrorCode))
      || (record.status === "running" && Boolean(record.leaseExpiresAt && record.leaseExpiresAt <= new Date())),
    version: record.version,
    schemaVersion: record.schemaVersion,
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function loadDevelopmentWorkflowRecord(id: string, userId?: string) {
  return prisma.developmentWorkflow.findFirst({ where: { id, ...(userId ? { userId } : {}) }, include: workflowInclude });
}

function interruptFromSnapshot(snapshot: Awaited<ReturnType<ReturnType<typeof createProductWorkflowGraph>["getState"]>>) {
  for (const task of snapshot.tasks) {
    for (const item of task.interrupts) {
      if (item.value && typeof item.value === "object") return item.value as InterruptPayload;
    }
  }
  return null;
}

function graphConfig(threadId: string) {
  return { configurable: { thread_id: threadId, checkpoint_ns: WORKFLOW_CHECKPOINT_NAMESPACE } };
}

function nodeState(input: {
  key: WorkflowNodeKey;
  state: ProductWorkflowStateType;
  interrupt: InterruptPayload | null;
}): { status: WorkflowNodeStatus; artifactType?: string; artifactId?: string; summary?: string } {
  const { key, state, interrupt } = input;
  if (key === "analyze_requirement") {
    return state.planningArtifactId ? { status: "completed", artifactType: "PlanningArtifact", artifactId: state.planningArtifactId, summary: "需求已转换为结构化分析。" } : { status: "pending" };
  }
  if (key === "create_plan") {
    if (state.planningStatus === "ready") return { status: "completed", artifactType: "PlanningArtifact", artifactId: state.planningArtifactId, summary: "计划、预算和动态目录已通过服务端校验。" };
    if (state.planningStatus === "needs_clarification") return { status: "partial", artifactType: "PlanningArtifact", artifactId: state.planningArtifactId, summary: "需要用户补充关键信息。" };
    if (state.planningStatus === "failed") return { status: "failed", artifactType: "PlanningArtifact", artifactId: state.planningArtifactId };
    return { status: "pending" };
  }
  if (key === "clarification") {
    if (interrupt?.kind === "clarification") return { status: "waiting", summary: `等待第${interrupt.round}轮补充信息。` };
    if (state.clarificationRound > 0) return { status: "completed", summary: `已合并${state.clarificationRound}轮用户补充。` };
    if (state.planningStatus === "ready") return { status: "skipped", summary: "需求信息充分，无需补充。" };
    return { status: "pending" };
  }
  if (key === "cross_review") {
    if (!state.reviewWorkflowId) return { status: "pending" };
    const status: WorkflowNodeStatus = state.reviewStatus === "partial" ? "partial" : state.reviewStatus === "inconclusive" ? "failed" : "completed";
    return { status, artifactType: "ReviewWorkflow", artifactId: state.reviewWorkflowId, summary: state.reviewStatus === "needs_human" ? "发现高影响取舍，等待人工裁决。" : "独立候选、Finding和Evaluator已保存。" };
  }
  if (key === "human_approval") {
    if (interrupt?.kind === "approval") return { status: "waiting", artifactType: "ReviewWorkflow", artifactId: state.reviewWorkflowId, summary: "等待人工选择交付、质量、混合或拒绝。" };
    if (state.approvalDecision) return { status: "completed", artifactType: "ReviewWorkflow", artifactId: state.reviewWorkflowId, summary: `人工裁决：${state.approvalDecision}` };
    if (state.reviewWorkflowId && state.reviewStatus !== "needs_human") return { status: "skipped", summary: "没有需要人工决定的高影响冲突。" };
    return { status: "pending" };
  }
  if (key === "generate_report") {
    if (!state.reportArtifactId) return { status: "pending" };
    return { status: state.reportStatus === "completed" ? "completed" : "partial", artifactType: "ReportArtifact", artifactId: state.reportArtifactId, summary: `报告终态：${state.reportStatus}` };
  }
  if (state.finalStatus) return { status: state.finalStatus === "completed" ? "completed" : state.finalStatus === "failed" ? "failed" : "partial", summary: `工作流终态：${state.finalStatus}` };
  return { status: "pending" };
}

function workflowStatus(state: ProductWorkflowStateType, interrupt: InterruptPayload | null): WorkflowStatus {
  if (interrupt?.kind === "clarification") return "needs_clarification";
  if (interrupt?.kind === "approval") return "needs_human";
  return state.finalStatus ?? "running";
}

async function syncGraphState(input: {
  workflowId: string;
  graph: ReturnType<typeof createProductWorkflowGraph>;
  threadId: string;
  lease: Pick<WorkflowLease, "ownerId" | "token">;
  lastResume?: WorkflowResume;
}) {
  const { workflowId, graph, threadId, lease, lastResume } = input;
  const snapshot = await graph.getState(graphConfig(threadId));
  const state = snapshot.values as ProductWorkflowStateType;
  const interrupt = interruptFromSnapshot(snapshot);
  const status = workflowStatus(state, interrupt);
  const currentNode = interrupt?.kind === "clarification" ? "clarification" : interrupt?.kind === "approval" ? "human_approval" : snapshot.next[0] ?? "finalize";
  const checkpointId = typeof snapshot.config.configurable?.checkpoint_id === "string" ? snapshot.config.configurable.checkpoint_id : null;
  const terminal = ["completed", "partial", "blocked", "inconclusive", "failed"].includes(status);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 所有工作流状态写入同时校验 owner 和 token，阻止过期实例覆盖新持有者。
    const updated = await writeFencedWorkflowState({
      workflows: tx.developmentWorkflow,
      workflowId,
      lease,
      data: {
        status,
        currentNode,
        requirement: state.requirement,
        planningArtifactId: state.planningArtifactId,
        reviewWorkflowId: state.reviewWorkflowId,
        reportArtifactId: state.reportArtifactId,
        productUIReportGroupId: state.productUIReportGroupId,
        checkpointId,
        checkpointNamespace: WORKFLOW_CHECKPOINT_NAMESPACE,
        interruptJson: interrupt ? JSON.stringify(interrupt) : null,
        lastResumeJson: lastResume ? JSON.stringify(lastResume) : undefined,
        lastErrorCode: null,
        leaseExpiresAt: null,
        leaseOwnerId: null,
        finishedAt: terminal ? now : null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("WORKFLOW_LEASE_FENCED");
    for (const node of WORKFLOW_NODES) {
      const mapped = nodeState({ key: node.key, state, interrupt });
      await tx.workflowNode.update({
        where: { workflowId_nodeKey: { workflowId, nodeKey: node.key } },
        data: {
          status: mapped.status,
          attempt: mapped.status === "pending" || mapped.status === "skipped" ? undefined : Math.max(1, node.key === "create_plan" ? state.clarificationRound + 1 : 1),
          artifactType: mapped.artifactType,
          artifactId: mapped.artifactId,
          summary: mapped.summary,
          errorCode: null,
          startedAt: mapped.status === "pending" || mapped.status === "skipped" ? undefined : now,
          finishedAt: ["completed", "partial", "blocked", "skipped", "failed"].includes(mapped.status) ? now : null,
        },
      });
    }
  });
  return loadDevelopmentWorkflowRecord(workflowId);
}

function safeErrorCode(error: unknown) {
  const raw = error instanceof Error ? error.message : "WORKFLOW_FAILED";
  return /^[A-Z0-9_:-]+$/.test(raw) ? raw.split(":")[0] : "WORKFLOW_FAILED";
}

async function markWorkflowFailed(id: string, error: unknown, lease: Pick<WorkflowLease, "ownerId" | "token">) {
  const code = safeErrorCode(error);
  // 失败状态也必须经过 fencing，避免旧实例把已恢复的工作流重新标记为失败。
  const updated = await writeFencedWorkflowState({
    workflows: prisma.developmentWorkflow,
    workflowId: id,
    lease,
    data: { status: "failed", lastErrorCode: code, interruptJson: null, leaseExpiresAt: null, leaseOwnerId: null, finishedAt: new Date(), version: { increment: 1 } },
  });
  // 旧实例失去租约时不能静默吞掉失败写入，否则调用方会误以为状态已持久化。
  if (updated.count !== 1) throw new Error("WORKFLOW_LEASE_FENCED");
  return code;
}

export async function createDevelopmentWorkflow(input: {
  userId: string;
  requirement: string;
  mode: WorkflowMode;
  agents: WorkflowAgentConfig;
  signal?: AbortSignal;
}) {
  const mode = WorkflowModeSchema.parse(input.mode);
  const agents = WorkflowAgentConfigSchema.parse(input.agents);
  if (mode === "model") {
    const agentIds = Array.from(new Set([
      agents.plannerAgentId,
      ...(agents.candidateAgentIds ?? []),
      agents.reviewerAgentId,
      agents.evaluatorAgentId,
      agents.reporterAgentId,
    ].filter((id): id is string => Boolean(id))));
    const owned = await prisma.agent.count({ where: { userId: input.userId, id: { in: agentIds } } });
    if (owned !== agentIds.length) throw new Error("WORKFLOW_AGENT_NOT_FOUND");
  }
  const threadId = crypto.randomUUID();
  const lease = newLease({ leaseToken: 0 });
  const record = await prisma.developmentWorkflow.create({
    data: {
      userId: input.userId,
      threadId,
      requirement: input.requirement,
      mode,
      agentConfigJson: JSON.stringify(agents),
      status: "running",
      currentNode: "create_plan",
      startedAt: new Date(),
      leaseExpiresAt: lease.expiresAt,
      leaseOwnerId: lease.ownerId,
      leaseToken: lease.token,
      nodes: { create: WORKFLOW_NODES.map((node) => ({ nodeKey: node.key, sortOrder: node.sortOrder })) },
    },
  });
  const graph = createProductWorkflowGraph(createPrismaWorkflowDependencies({
    mode,
    agents,
    signal: input.signal ?? new AbortController().signal,
  }), await getWorkflowCheckpointer());
  try {
    await runWithLeaseRenewal({
      workflowId: record.id,
      lease,
      run: () => startProductWorkflow({ graph, workflowId: record.id, threadId, userId: input.userId, requirement: input.requirement }),
      renew: () => renewWorkflowLease(record.id, lease),
      renewalIntervalMs: WORKFLOW_LEASE_RENEW_INTERVAL_MS,
    });
    return await syncGraphState({ workflowId: record.id, graph, threadId, lease });
  } catch (error) {
    await markWorkflowFailed(record.id, error, lease);
    throw error;
  }
}

export async function resumeDevelopmentWorkflow(input: { id: string; userId: string; resume: WorkflowResume; signal?: AbortSignal }) {
  const resume = WorkflowResumeSchema.parse(input.resume);
  const record = await prisma.developmentWorkflow.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!record) throw new Error("WORKFLOW_NOT_FOUND");
  const expectedStatus = resume.kind === "clarification" ? "needs_clarification" : "needs_human";
  if (record.status !== expectedStatus) {
    if (record.lastResumeJson === JSON.stringify(resume)) return loadDevelopmentWorkflowRecord(record.id, input.userId);
    throw new Error("WORKFLOW_NOT_WAITING_FOR_INPUT");
  }
  const lease = newLease(record);
  const claimed = await prisma.developmentWorkflow.updateMany({
    // waiting 状态已释放上一个实例的租约；version + token 共同防止并发 resume。
    where: { id: record.id, userId: input.userId, status: expectedStatus, version: record.version, leaseToken: record.leaseToken, leaseOwnerId: null },
    data: { status: "running", interruptJson: null, leaseExpiresAt: lease.expiresAt, leaseOwnerId: lease.ownerId, leaseToken: lease.token, version: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new Error("WORKFLOW_RESUME_CONFLICT");

  const mode = WorkflowModeSchema.parse(record.mode);
  const agents = WorkflowAgentConfigSchema.parse(JSON.parse(record.agentConfigJson));
  const graph = createProductWorkflowGraph(createPrismaWorkflowDependencies({
    mode,
    agents,
    signal: input.signal ?? new AbortController().signal,
  }), await getWorkflowCheckpointer());
  try {
    await runWithLeaseRenewal({
      workflowId: record.id,
      lease,
      run: () => resumeProductWorkflow({ graph, threadId: record.threadId, resume }),
      renew: () => renewWorkflowLease(record.id, lease),
      renewalIntervalMs: WORKFLOW_LEASE_RENEW_INTERVAL_MS,
    });
    return await syncGraphState({ workflowId: record.id, graph, threadId: record.threadId, lease, lastResume: resume });
  } catch (error) {
    await markWorkflowFailed(record.id, error, lease);
    throw error;
  }
}

export async function recoverDevelopmentWorkflow(input: { id: string; userId: string; signal?: AbortSignal }) {
  const record = await prisma.developmentWorkflow.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!record) throw new Error("WORKFLOW_NOT_FOUND");
  const staleRunning = record.status === "running" && Boolean(record.leaseExpiresAt && record.leaseExpiresAt <= new Date());
  const recoverableFailure = record.status === "failed" && Boolean(record.lastErrorCode);
  if (!recoverableFailure && !staleRunning) throw new Error("WORKFLOW_RECOVERY_NOT_AVAILABLE");

  const lease = newLease(record);
  // failed 已释放租约；running 仅允许在旧租约过期后由新实例接管。
  const claimed = record.status === "running"
    ? await claimExpiredWorkflowLease({
      workflows: prisma.developmentWorkflow,
      workflowId: record.id,
      userId: input.userId,
      expectedVersion: record.version,
      expectedLeaseToken: record.leaseToken,
      lease,
      now: new Date(),
    })
    : await prisma.developmentWorkflow.updateMany({
      where: { id: record.id, userId: input.userId, status: record.status, version: record.version, leaseToken: record.leaseToken, leaseOwnerId: null },
      data: { status: "running", lastErrorCode: null, leaseExpiresAt: lease.expiresAt, leaseOwnerId: lease.ownerId, leaseToken: lease.token, finishedAt: null, version: { increment: 1 } },
    });
  if (claimed.count !== 1) throw new Error("WORKFLOW_RECOVERY_CONFLICT");

  const mode = WorkflowModeSchema.parse(record.mode);
  const agents = WorkflowAgentConfigSchema.parse(JSON.parse(record.agentConfigJson));
  const graph = createProductWorkflowGraph(createPrismaWorkflowDependencies({
    mode,
    agents,
    signal: input.signal ?? new AbortController().signal,
  }), await getWorkflowCheckpointer());
  try {
    const snapshot = await graph.getState(graphConfig(record.threadId));
    if (interruptFromSnapshot(snapshot)) return syncGraphState({ workflowId: record.id, graph, threadId: record.threadId, lease });
    await runWithLeaseRenewal({
      workflowId: record.id,
      lease,
      run: () => continueProductWorkflow({ graph, threadId: record.threadId }),
      renew: () => renewWorkflowLease(record.id, lease),
      renewalIntervalMs: WORKFLOW_LEASE_RENEW_INTERVAL_MS,
    });
    return await syncGraphState({ workflowId: record.id, graph, threadId: record.threadId, lease });
  } catch (error) {
    await markWorkflowFailed(record.id, error, lease);
    throw error;
  }
}

export async function getDevelopmentWorkflow(id: string, userId: string) {
  return loadDevelopmentWorkflowRecord(id, userId);
}

export async function listDevelopmentWorkflows(userId: string) {
  return prisma.developmentWorkflow.findMany({ where: { userId }, include: workflowInclude, orderBy: { createdAt: "desc" }, take: 30 });
}
