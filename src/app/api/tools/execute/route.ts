import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ToolExecutionError } from "@/lib/tools/registry";
import { executeToolForRun } from "@/lib/tools/tool-service";

const toolCallSchema = z.object({
  runId: z.string().min(1).max(100),
  toolCallId: z.string().min(1).max(100),
  toolId: z.string().min(1).max(100),
  input: z.unknown(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const runId = request.nextUrl.searchParams.get("runId") ?? "";
  if (!runId) return Response.json({ error: { code: "RUN_ID_REQUIRED", message: "runId is required." } }, { status: 400 });
  const run = await prisma.run.findFirst({ where: { id: runId, userId: user.id }, select: { id: true } });
  if (!run) return Response.json({ error: { code: "RUN_NOT_FOUND", message: "Run not found." } }, { status: 404 });
  const invocations = await prisma.toolInvocation.findMany({
    where: { runId, userId: user.id }, orderBy: { startedAt: "asc" },
    select: { id: true, toolId: true, status: true, errorCode: true, startedAt: true, finishedAt: true, durationMs: true },
  });
  return Response.json({ invocations });
}

/** 执行当前用户计划明确授权的结构化只读 Tool，并以 toolCallId 审计和幂等。 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const body = toolCallSchema.parse(await request.json());
    const result = await executeToolForRun({ userId: user.id, ...body, rawInput: body.input, signal: request.signal });
    return Response.json({ toolCallId: body.toolCallId, toolId: body.toolId, status: "completed", ...result });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_TOOL_CALL", message: error.issues[0]?.message } }, { status: 400 });
    const safe = error instanceof ToolExecutionError ? error : new ToolExecutionError("TOOL_EXECUTION_FAILED", "Tool execution failed.", 500);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
