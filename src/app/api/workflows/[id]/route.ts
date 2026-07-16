import { getCurrentUser } from "@/lib/current-user";
import { getDevelopmentWorkflow, mapDevelopmentWorkflow } from "@/lib/workflow/prisma-workflow";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await getDevelopmentWorkflow(id, user.id);
  if (!record) return Response.json({ error: { code: "WORKFLOW_NOT_FOUND", message: "Workflow not found." } }, { status: 404 });
  return Response.json({ workflow: mapDevelopmentWorkflow(record) });
}
