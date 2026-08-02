import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createPrismaRunHandle } from "@/lib/engine/prisma-run-persistence";
import { StructuredOutputError } from "@/lib/planner/structured-output";
import { ReportBudgetSchema } from "@/lib/report/contracts";
import { createReportModelContext } from "@/lib/report/model-generator";
import { loadReportGenerationInput, mapReportArtifact, saveReportArtifact } from "@/lib/report/prisma-report";
import { createBaselineDevelopmentReport } from "@/lib/report/report-service";
import type { WorkspaceMessage } from "@/lib/types";

export const runtime = "nodejs";

const createReportSchema = z.object({
  reviewWorkflowId: z.string().min(1),
  generationKey: z.string().min(8).max(100),
  reporterAgentId: z.string().min(1).optional(),
  budget: ReportBudgetSchema.partial().optional(),
});
const DEFAULT_REPORT_BUDGET = ReportBudgetSchema.parse({});

function apiError(error: unknown) {
  if (error instanceof StructuredOutputError) return { status: 422, code: error.code, message: "Reporter produced invalid product/UI report output twice; no ReportArtifact was saved." };
  const code = error instanceof Error ? error.message.split(":")[0] : "REPORT_GENERATION_FAILED";
  if (code === "REVIEW_NOT_FOUND") return { status: 404, code, message: "Review not found." };
  if (code === "REPORT_APPROVAL_REQUIRED") return { status: 409, code, message: "A pending high-impact decision must be confirmed before report generation." };
  if (["REVIEW_NOT_REPORTABLE", "PLANNING_ARTIFACT_NOT_READY", "REVIEW_INCOMPLETE", "REPORT_VALIDATION_FAILED"].includes(code)) return { status: 422, code, message: "The source chain is incomplete or does not satisfy the report contract." };
  if (code === "WORKSPACE_ALREADY_RUNNING") return { status: 409, code, message: "Another report generation is already running for this user." };
  if (code === "REPORTER_AGENT_NOT_FOUND") return { status: 404, code, message: "Product/UI report Reporter Agent not found for the current user." };
  if (code === "REPORT_BUDGET_EXCEEDED") return { status: 422, code, message: "Reporter stopped at the configured Token or cost budget." };
  if (code === "REPORT_SOURCE_SENSITIVE") return { status: 422, code, message: "Reporter input contains credential-like material and was blocked before the model call." };
  return { status: 500, code: "REPORT_GENERATION_FAILED", message: "Report generation stopped safely." };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const records = await prisma.reportArtifact.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return Response.json({ reports: records.map(mapReportArtifact) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  let body: z.infer<typeof createReportSchema>;
  try { body = createReportSchema.parse(await request.json()); }
  catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid report request.";
    return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
  }

  const existing = await prisma.reportArtifact.findFirst({ where: { userId: user.id, generationKey: body.generationKey } });
  if (existing) {
    if (existing.reviewWorkflowId !== body.reviewWorkflowId) {
      return Response.json({ error: { code: "REPORT_GENERATION_KEY_CONFLICT", message: "generationKey already belongs to another review." } }, { status: 409 });
    }
    return Response.json({ report: mapReportArtifact(existing), mode: "replay", replayed: true });
  }

  let source: Awaited<ReturnType<typeof loadReportGenerationInput>>;
  try { source = await loadReportGenerationInput(body.reviewWorkflowId, user.id); }
  catch (error) {
    const safe = apiError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }

  const budget = ReportBudgetSchema.parse({ ...DEFAULT_REPORT_BUDGET, ...body.budget });
  let modelContext: Awaited<ReturnType<typeof createReportModelContext>> | null = null;
  if (body.reporterAgentId) {
    try { modelContext = await createReportModelContext({ userId: user.id, reporterAgentId: body.reporterAgentId, budget, signal: request.signal }); }
    catch (error) {
      const safe = apiError(error);
      return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
    }
  }

  const workspaceId = `report-run-${user.id}`;
  await prisma.workspace.upsert({
    where: { id: workspaceId }, update: {},
    create: { id: workspaceId, userId: user.id, name: "Report Generator", description: "Versioned dynamic development report generation", mode: "sequential", budgetLimit: 9_999 },
  });
  let handle: Awaited<ReturnType<typeof createPrismaRunHandle>> | null = null;
  let completed = false;
  let usageSaved = false;
  try {
    handle = await createPrismaRunHandle({ workspaceId, userId: user.id, runInput: `Generate report for review ${source.reviewWorkflow.id}` });
    const message: WorkspaceMessage = { id: crypto.randomUUID(), runId: handle.runId, role: "user", content: JSON.stringify({ reviewWorkflowId: source.reviewWorkflow.id }), createdAt: new Date().toISOString() };
    await handle.persistence.saveUserMessage(message);
    const report = modelContext ? await modelContext.generate(source) : createBaselineDevelopmentReport(source);
    const artifact = await saveReportArtifact({ runId: handle.runId, userId: user.id, generationKey: body.generationKey, source, report });
    if (modelContext && modelContext.usage.attempts > 0) {
      const assistantMessage: WorkspaceMessage = { id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: modelContext.usage.agent.id, content: JSON.stringify({ reportArtifactId: artifact.id, attempts: modelContext.usage.attempts, status: "accepted" }), createdAt: new Date().toISOString() };
      await handle.persistence.saveAssistantResult({ message: assistantMessage, ...modelContext.usage });
      usageSaved = true;
    }
    const warning = report.status !== "completed";
    await handle.persistence.completeRun({ runId: handle.runId, totalSpent: modelContext?.usage.costUsd ?? 0, budgetStatus: warning ? "warning" : "idle", ...(warning ? { errorCode: `REPORT_${report.status.toUpperCase()}` } : {}), startedAt: handle.startedAt });
    completed = true;
    return Response.json({ report: mapReportArtifact(artifact), mode: modelContext ? "model" : "baseline", replayed: false }, { status: 201 });
  } catch (error) {
    const safe = apiError(error);
    if (handle && !completed) {
      try {
        if (modelContext && modelContext.usage.attempts > 0 && !usageSaved) {
          const rejectedMessage: WorkspaceMessage = { id: crypto.randomUUID(), runId: handle.runId, role: "assistant", agentId: modelContext.usage.agent.id, content: JSON.stringify({ attempts: modelContext.usage.attempts, status: "rejected", code: safe.code }), createdAt: new Date().toISOString() };
          await handle.persistence.saveAssistantResult({ message: rejectedMessage, ...modelContext.usage });
          await handle.persistence.updateProgress(modelContext.usage.costUsd, "warning");
          usageSaved = true;
        }
        await handle.failRun(safe.code);
      } catch { /* preserve original error */ }
    }
    return Response.json({ error: { code: safe.code, message: safe.message }, runId: handle?.runId }, { status: safe.status });
  }
}
