import { NextRequest } from "next/server";
import { runDemoWorkspace } from "@/lib/engine/orchestrator";
import { createRunSseResponse } from "@/lib/http/run-sse";
import { runWorkspaceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = runWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", message: "请输入要交给工作区处理的任务。" } }, { status: 400 });
  return createRunSseResponse(request.signal, ({ send, signal }) => runDemoWorkspace({ input: parsed.data.input, onEvent: send, signal }));
}
