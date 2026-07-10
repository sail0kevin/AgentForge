import { NextRequest } from "next/server";
import { runDemoWorkspace } from "@/lib/engine/orchestrator";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { input } = await request.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (!input || typeof input !== "string") {
          send({ type: "error", message: "请输入要交给工作区处理的任务。" });
          return;
        }

        await runDemoWorkspace({ input, onEvent: send });
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
