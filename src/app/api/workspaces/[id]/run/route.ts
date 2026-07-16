import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runPersistentWorkspace } from "@/lib/engine/orchestrator";
import { runWorkspaceSchema } from "@/lib/validation";
import { createRunSseResponse } from "@/lib/http/run-sse";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await params;
  const { input } = runWorkspaceSchema.parse(await request.json());
  return createRunSseResponse(request.signal, ({ send, signal }) =>
    runPersistentWorkspace({ workspaceId: id, userId: user.id, input, onEvent: send, signal })
  );
}
