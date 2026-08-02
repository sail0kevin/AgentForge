import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { getPilotFeedback, PilotFeedbackInputSchema, savePilotFeedback } from "@/lib/pilot/feedback";

export const runtime = "nodejs";

function feedbackError(error: unknown) {
  const code = error instanceof Error ? error.message : "PILOT_FEEDBACK_FAILED";
  if (code === "WORKFLOW_NOT_FOUND") return { status: 404, code, message: "Workflow not found." };
  if (code === "WORKFLOW_NOT_TERMINAL") return { status: 409, code, message: "Feedback is only available after the workflow reaches a final status." };
  return { status: 500, code: "PILOT_FEEDBACK_FAILED", message: "Pilot feedback could not be saved." };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ feedback: await getPilotFeedback(id, user.id) });
  } catch (error) {
    const safe = feedbackError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const { id } = await context.params;
    const feedback = PilotFeedbackInputSchema.parse(await request.json());
    return Response.json({ feedback: await savePilotFeedback({ workflowId: id, userId: user.id, feedback }) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message } }, { status: 400 });
    const safe = feedbackError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
