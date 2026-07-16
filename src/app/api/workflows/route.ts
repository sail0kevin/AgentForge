import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { CreateDevelopmentWorkflowSchema } from "@/lib/workflow/contracts";
import { createDevelopmentWorkflow, listDevelopmentWorkflows, mapDevelopmentWorkflow } from "@/lib/workflow/prisma-workflow";
import { StructuredOutputError } from "@/lib/planner/structured-output";

export const runtime = "nodejs";

function safeWorkflowError(error: unknown) {
  if (error instanceof StructuredOutputError) return { status: 422, code: error.code, message: "A model produced invalid structured output twice; the failed node was recorded without creating an untrusted artifact." };
  const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_FAILED";
  if (code === "WORKSPACE_ALREADY_RUNNING") return { status: 409, code: "WORKFLOW_ALREADY_RUNNING", message: "Another workflow node is already running for this user." };
  if (["WORKFLOW_AGENT_NOT_FOUND", "PLANNER_AGENT_NOT_FOUND", "REVIEW_AGENT_NOT_FOUND", "REPORTER_AGENT_NOT_FOUND"].includes(code)) {
    return { status: 404, code, message: "One or more selected workflow Agents do not belong to the current user." };
  }
  if (code === "CREDENTIAL_NOT_CONFIGURED") return { status: 422, code, message: "A selected model Agent has no valid provider credential." };
  if (["PLANNER_BUDGET_EXCEEDED", "REVIEW_BUDGET_EXCEEDED", "REPORT_BUDGET_EXCEEDED"].includes(code)) {
    return { status: 422, code, message: "The workflow stopped at the configured model budget." };
  }
  return { status: 500, code, message: "The workflow stopped safely. Completed artifacts remain available for recovery." };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const records = await listDevelopmentWorkflows(user.id);
  return Response.json({ workflows: records.map(mapDevelopmentWorkflow) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const body = CreateDevelopmentWorkflowSchema.parse(await request.json());
    const record = await createDevelopmentWorkflow({
      userId: user.id,
      requirement: body.requirement,
      mode: body.mode,
      agents: body.agents,
      signal: request.signal,
    });
    const workflow = mapDevelopmentWorkflow(record);
    const waiting = workflow.status === "needs_clarification" || workflow.status === "needs_human";
    return Response.json({ workflow }, { status: waiting ? 202 : 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message } }, { status: 400 });
    const safe = safeWorkflowError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
