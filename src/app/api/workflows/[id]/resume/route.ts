import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { WorkflowResumeSchema } from "@/lib/workflow/contracts";
import { mapDevelopmentWorkflow, resumeDevelopmentWorkflow } from "@/lib/workflow/prisma-workflow";

export const runtime = "nodejs";

function resumeError(error: unknown) {
  const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_RESUME_FAILED";
  if (code === "WORKFLOW_NOT_FOUND") return { status: 404, code, message: "Workflow not found." };
  if (code === "WORKFLOW_NOT_WAITING_FOR_INPUT") return { status: 409, code, message: "This workflow is not waiting for that kind of input." };
  if (code === "WORKFLOW_RESUME_CONFLICT") return { status: 409, code, message: "Another request already resumed this checkpoint." };
  if (code === "REVIEW_ALREADY_DECIDED") return { status: 409, code, message: "The review already has a different final decision." };
  return { status: 500, code, message: "The checkpoint could not be resumed safely." };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const body = WorkflowResumeSchema.parse(await request.json());
    const { id } = await context.params;
    const record = await resumeDevelopmentWorkflow({ id, userId: user.id, resume: body, signal: request.signal });
    const workflow = mapDevelopmentWorkflow(record);
    const waiting = workflow.status === "needs_clarification" || workflow.status === "needs_human";
    return Response.json({ workflow }, { status: waiting ? 202 : 200 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message } }, { status: 400 });
    const safe = resumeError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
