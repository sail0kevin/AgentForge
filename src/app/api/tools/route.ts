import { getCurrentUser } from "@/lib/current-user";
import { ensureToolsInitialized } from "@/lib/tools/init";
import { getAllTools, getSafeToolMetadata } from "@/lib/tools/registry";

/** GET /api/tools - returns the safe, registered tool metadata for the current user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  ensureToolsInitialized();
  const tools = getAllTools().map(getSafeToolMetadata);
  return Response.json(tools, { status: 200 });
}
