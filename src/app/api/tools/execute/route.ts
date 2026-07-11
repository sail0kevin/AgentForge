import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getTool } from "@/lib/tools/registry";

/** POST /api/tools/execute - only invokes a registered tool for an authenticated user. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
    const body = await request.json();
    const toolId = typeof body.toolId === "string" ? body.toolId : "";
    const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
    const tool = getTool(toolId);
    if (!tool) return Response.json({ error: "Tool not found" }, { status: 404 });
    const result = await tool.execute(input);
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: "Tool execution failed" }, { status: 500 });
  }
}
