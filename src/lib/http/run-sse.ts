import { toSafeRunError } from "@/lib/errors/run-error";

type RunSseExecutor = (context: { send: (event: unknown) => void; signal: AbortSignal }) => Promise<unknown>;

/** 统一 SSE 断开、AbortSignal 传播、脱敏错误和关闭语义。 */
export function createRunSseResponse(requestSignal: AbortSignal, execute: RunSseExecutor): Response {
  const encoder = new TextEncoder();
  const runController = new AbortController();
  const abortRun = () => {
    if (!runController.signal.aborted) runController.abort(new Error("RUN_CANCELLED"));
  };
  requestSignal.addEventListener("abort", abortRun, { once: true });
  let closed = false;
  let runId: string | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (closed || runController.signal.aborted) return;
        if (event && typeof event === "object" && "runId" in event && typeof event.runId === "string") runId = event.runId;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
          abortRun();
        }
      };
      try {
        await execute({ send, signal: runController.signal });
      } catch (error) {
        const safeError = toSafeRunError(error);
        send({ version: 1, type: "error", runId, message: safeError.message, code: safeError.code });
      } finally {
        requestSignal.removeEventListener("abort", abortRun);
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { abortRun(); }
        }
      }
    },
    cancel() {
      closed = true;
      abortRun();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
