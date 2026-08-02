import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ApprovalResumeSchema, ClarificationResumeSchema } from "./contracts";
import type { IncrementalApprovalPatch } from "@/lib/planner/incremental-approval";
import { traceAsync, type TraceProvider } from "@/lib/observability/tracing";

export type PlanningNodeResult = {
  planningArtifactId: string;
  status: "ready" | "needs_clarification" | "failed";
  questions: string[];
};

export type ReviewNodeResult = {
  reviewWorkflowId: string;
  status: "approved" | "partial" | "needs_human" | "inconclusive";
};

export type ReportNodeResult = {
  reportArtifactId: string;
  status: "completed" | "partial" | "blocked" | "inconclusive";
};

export type ProductWorkflowDependencies = {
  plan: (input: { workflowId: string; userId: string; requirement: string; nodeKey: string }) => Promise<PlanningNodeResult>;
  review: (input: { workflowId: string; userId: string; planningArtifactId: string; nodeKey: string }) => Promise<ReviewNodeResult>;
  approve: (input: { workflowId: string; userId: string; reviewWorkflowId: string; decision: "delivery" | "quality" | "hybrid" | "reject"; note?: string; taskPatch?: IncrementalApprovalPatch }) => Promise<void>;
  report: (input: { workflowId: string; userId: string; reviewWorkflowId: string; generationKey: string }) => Promise<ReportNodeResult>;
};

const ProductWorkflowState = Annotation.Root({
  workflowId: Annotation<string>,
  threadId: Annotation<string>,
  userId: Annotation<string>,
  requirement: Annotation<string>,
  planningArtifactId: Annotation<string | undefined>,
  planningStatus: Annotation<PlanningNodeResult["status"] | undefined>,
  clarificationQuestions: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  clarificationRound: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  maxClarificationRounds: Annotation<number>({ reducer: (_, next) => next, default: () => 2 }),
  reviewWorkflowId: Annotation<string | undefined>,
  reviewStatus: Annotation<ReviewNodeResult["status"] | undefined>,
  approvalDecision: Annotation<string | undefined>,
  reportArtifactId: Annotation<string | undefined>,
  reportStatus: Annotation<ReportNodeResult["status"] | undefined>,
  finalStatus: Annotation<"completed" | "partial" | "blocked" | "inconclusive" | "failed" | undefined>,
});

export type ProductWorkflowStateType = typeof ProductWorkflowState.State;

function planRoute(state: ProductWorkflowStateType) {
  if (state.planningStatus === "ready") return "cross_review";
  if (state.planningStatus === "needs_clarification" && state.clarificationRound < state.maxClarificationRounds) return "clarification";
  return "finalize";
}

function reviewRoute(state: ProductWorkflowStateType) {
  if (state.reviewStatus === "needs_human") return "human_approval";
  if (state.reviewStatus === "approved" || state.reviewStatus === "partial") return "generate_report";
  return "finalize";
}

export function createProductWorkflowGraph(dependencies: ProductWorkflowDependencies, checkpointer: BaseCheckpointSaver, traceProvider?: TraceProvider) {
  // 统一包装节点，保证成功、异常和 interrupt 恢复路径都有成对的 entry/exit span。
  const traceNode = <T>(nodeName: string, run: (state: ProductWorkflowStateType) => Promise<T> | T) => async (state: ProductWorkflowStateType) => traceAsync({
    provider: traceProvider,
    name: "agentforge.workflow.node",
    attributes: { "agentforge.workflow_id": state.workflowId, "agentforge.node": nodeName },
    run: () => run(state),
  });
  const createPlan = async (state: ProductWorkflowStateType) => {
    const result = await dependencies.plan({
      workflowId: state.workflowId,
      userId: state.userId,
      requirement: state.requirement,
      nodeKey: `${state.workflowId}:plan:${state.clarificationRound}`,
    });
    return { planningArtifactId: result.planningArtifactId, planningStatus: result.status, clarificationQuestions: result.questions };
  };

  const requestClarification = (state: ProductWorkflowStateType) => {
    const resume = ClarificationResumeSchema.parse(interrupt({
      kind: "clarification",
      workflowId: state.workflowId,
      questions: state.clarificationQuestions,
      round: state.clarificationRound + 1,
      maxRounds: state.maxClarificationRounds,
    }));
    return {
      requirement: `${state.requirement}\n\n【用户补充信息 ${state.clarificationRound + 1}】\n${resume.answer}`,
      clarificationRound: state.clarificationRound + 1,
      planningArtifactId: undefined,
      planningStatus: undefined,
      clarificationQuestions: [],
    };
  };

  const crossReview = async (state: ProductWorkflowStateType) => {
    if (!state.planningArtifactId) throw new Error("WORKFLOW_PLAN_MISSING");
    const result = await dependencies.review({
      workflowId: state.workflowId,
      userId: state.userId,
      planningArtifactId: state.planningArtifactId,
      nodeKey: `${state.workflowId}:review`,
    });
    return { reviewWorkflowId: result.reviewWorkflowId, reviewStatus: result.status };
  };

  const humanApproval = async (state: ProductWorkflowStateType) => {
    if (!state.reviewWorkflowId) throw new Error("WORKFLOW_REVIEW_MISSING");
    const resume = ApprovalResumeSchema.parse(interrupt({
      kind: "approval",
      workflowId: state.workflowId,
      reviewWorkflowId: state.reviewWorkflowId,
      decisions: ["delivery", "quality", "hybrid", "reject"],
    }));
    await dependencies.approve({ workflowId: state.workflowId, userId: state.userId, reviewWorkflowId: state.reviewWorkflowId, decision: resume.decision, note: resume.note, taskPatch: resume.taskPatch });
    return { approvalDecision: resume.decision };
  };

  const generateReport = async (state: ProductWorkflowStateType) => {
    if (!state.reviewWorkflowId) throw new Error("WORKFLOW_REVIEW_MISSING");
    const result = await dependencies.report({
      workflowId: state.workflowId,
      userId: state.userId,
      reviewWorkflowId: state.reviewWorkflowId,
      generationKey: `workflow:${state.workflowId}:report:1`,
    });
    return { reportArtifactId: result.reportArtifactId, reportStatus: result.status };
  };

  const finalize = (state: ProductWorkflowStateType) => {
    if (state.reportStatus) return { finalStatus: state.reportStatus };
    if (state.reviewStatus === "inconclusive") return { finalStatus: "inconclusive" as const };
    if (state.planningStatus === "failed") return { finalStatus: "failed" as const };
    return { finalStatus: "blocked" as const };
  };

  return new StateGraph(ProductWorkflowState)
    .addNode("create_plan", traceNode("create_plan", createPlan))
    .addNode("clarification", traceNode("clarification", requestClarification))
    .addNode("cross_review", traceNode("cross_review", crossReview))
    .addNode("human_approval", traceNode("human_approval", humanApproval))
    .addNode("generate_report", traceNode("generate_report", generateReport))
    .addNode("finalize", traceNode("finalize", finalize))
    .addEdge(START, "create_plan")
    .addConditionalEdges("create_plan", planRoute, ["cross_review", "clarification", "finalize"])
    .addEdge("clarification", "create_plan")
    .addConditionalEdges("cross_review", reviewRoute, ["human_approval", "generate_report", "finalize"])
    .addEdge("human_approval", "generate_report")
    .addEdge("generate_report", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer });
}

export async function startProductWorkflow(input: {
  graph: ReturnType<typeof createProductWorkflowGraph>;
  workflowId: string;
  threadId: string;
  userId: string;
  requirement: string;
}) {
  return input.graph.invoke({
    workflowId: input.workflowId,
    threadId: input.threadId,
    userId: input.userId,
    requirement: input.requirement,
    clarificationRound: 0,
    maxClarificationRounds: 2,
  }, { configurable: { thread_id: input.threadId, checkpoint_ns: "" } });
}

export async function resumeProductWorkflow(input: {
  graph: ReturnType<typeof createProductWorkflowGraph>;
  threadId: string;
  resume: unknown;
}) {
  return input.graph.invoke(new Command({ resume: input.resume }), {
    configurable: { thread_id: input.threadId, checkpoint_ns: "" },
  });
}

/** Continue from the latest durable checkpoint after a process-level failure. */
export async function continueProductWorkflow(input: {
  graph: ReturnType<typeof createProductWorkflowGraph>;
  threadId: string;
}) {
  return input.graph.invoke(null, {
    configurable: { thread_id: input.threadId, checkpoint_ns: "" },
  });
}
