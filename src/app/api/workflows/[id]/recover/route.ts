import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { mapDevelopmentWorkflow, recoverDevelopmentWorkflow } from "@/lib/workflow/prisma-workflow";

export const runtime = "nodejs";

function recoveryError(error: unknown) {
  const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message.split(":")[0] : "WORKFLOW_RECOVERY_FAILED";
  if (code === "WORKFLOW_NOT_FOUND") return { status: 404, code, message: "Workflow not found." };
  if (code === "WORKFLOW_RECOVERY_NOT_AVAILABLE") return { status: 409, code, message: "This workflow is not failed or waiting on an expired execution lease." };
  if (code === "WORKFLOW_RECOVERY_CONFLICT") return { status: 409, code, message: "Another request already claimed workflow recovery." };
  return { status: 500, code, message: "Recovery stopped safely; the durable checkpoint and completed artifacts were retained." };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const { id } = await context.params;
    const record = await recoverDevelopmentWorkflow({ id, userId: user.id, signal: request.signal });
    const workflow = mapDevelopmentWorkflow(record);
    const waiting = workflow.status === "needs_clarification" || workflow.status === "needs_human";
    return Response.json({ workflow }, { status: waiting ? 202 : 200 });
  } catch (error) {
    const safe = recoveryError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
