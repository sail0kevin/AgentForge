import { getCurrentUser } from "@/lib/current-user";
import { getAllTools } from "@/lib/tools/registry";

/** GET /api/tools - returns the safe, registered tool metadata for the current user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const tools = getAllTools().map((tool) => ({ id: tool.id, name: tool.name, description: tool.description, parameters: tool.parameters }));
  return Response.json(tools, { status: 200 });
}
