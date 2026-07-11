import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runPersistentWorkspace } from "@/lib/engine/orchestrator";
import { runWorkspaceSchema } from "@/lib/validation";
import { toSafeRunError } from "@/lib/errors/run-error";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await params;
  const { input } = runWorkspaceSchema.parse(await request.json());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await runPersistentWorkspace({ workspaceId: id, userId: user.id, input, onEvent: send });
      } catch (error) {
        const safeError = toSafeRunError(error);
        send({ type: "error", message: safeError.message, code: safeError.code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
