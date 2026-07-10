import { NextRequest } from "next/server";
import { runPersistentWorkspace } from "@/lib/engine/orchestrator";
import { runWorkspaceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { input } = runWorkspaceSchema.parse(await request.json());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        await runPersistentWorkspace({ workspaceId: id, input, onEvent: send });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "运行失败" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
