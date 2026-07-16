import "server-only";
import { prisma } from "@/lib/db";
import { ExecutionPlanSchema } from "@/lib/planner/contracts";
import { ensureToolsInitialized } from "./init";
import { executeRegisteredTool, getTool, ToolExecutionError } from "./registry";

function parsePlan(value: string | null) {
  try {
    return ExecutionPlanSchema.parse(JSON.parse(value ?? "null"));
  } catch {
    throw new ToolExecutionError("PLAN_UNAVAILABLE", "The run does not contain a valid executable plan.", 409);
  }
}

export async function executeToolForRun(input: {
  userId: string;
  runId: string;
  toolCallId: string;
  toolId: string;
  rawInput: unknown;
  signal: AbortSignal;
}) {
  ensureToolsInitialized();
  const tool = getTool(input.toolId);
  if (!tool) throw new ToolExecutionError("TOOL_NOT_FOUND", "Tool is not registered.", 404);
  const encodedInput = JSON.stringify(input.rawInput);
  if (new TextEncoder().encode(encodedInput).byteLength > tool.maxInputBytes) throw new ToolExecutionError("TOOL_INPUT_TOO_LARGE", "Tool input exceeds its size limit.", 413);

  const existing = await prisma.toolInvocation.findUnique({ where: { id: input.toolCallId } });
  if (existing) {
    if (existing.userId !== input.userId || existing.runId !== input.runId || existing.toolId !== input.toolId) throw new ToolExecutionError("TOOL_CALL_ID_CONFLICT", "toolCallId already belongs to another invocation.", 409);
    if (existing.status === "completed" && existing.outputJson) return { output: JSON.parse(existing.outputJson) as unknown, replayed: true };
    throw new ToolExecutionError("TOOL_CALL_ALREADY_STARTED", "This tool call has already started.", 409);
  }

  const run = await prisma.run.findFirst({ where: { id: input.runId, userId: input.userId }, include: { planningArtifact: true } });
  if (!run) throw new ToolExecutionError("RUN_NOT_FOUND", "Run not found.", 404);
  const plan = parsePlan(run.planningArtifact?.executionPlan ?? null);
  const allowedToolIds = new Set(plan.tasks.flatMap((task) => task.toolIds));
  const priorCalls = await prisma.toolInvocation.count({ where: { runId: input.runId, toolId: input.toolId } });
  const startedAt = new Date();
  await prisma.toolInvocation.create({
    data: { id: input.toolCallId, runId: input.runId, userId: input.userId, toolId: input.toolId, status: "running", inputJson: encodedInput, startedAt },
  });

  try {
    const output = await executeRegisteredTool({ ...input, allowedToolIds, callNumber: priorCalls + 1 });
    const finishedAt = new Date();
    await prisma.toolInvocation.update({
      where: { id: input.toolCallId },
      data: { status: "completed", outputJson: JSON.stringify(output), finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime() },
    });
    return { output, replayed: false };
  } catch (error) {
    const safe = error instanceof ToolExecutionError ? error : new ToolExecutionError("TOOL_EXECUTION_FAILED", "Tool execution failed.", 500);
    const finishedAt = new Date();
    await prisma.toolInvocation.update({ where: { id: input.toolCallId }, data: { status: "failed", errorCode: safe.code, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime() } });
    throw safe;
  }
}
