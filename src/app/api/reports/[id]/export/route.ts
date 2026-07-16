import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { DevelopmentReportSchema } from "@/lib/report/contracts";
import { loadReportGenerationInput } from "@/lib/report/prisma-report";
import { renderDevelopmentReportMarkdown, validateDevelopmentReport } from "@/lib/report/report-service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.reportArtifact.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "REPORT_NOT_FOUND", message: "Report not found." } }, { status: 404 });
  try {
    const report = DevelopmentReportSchema.parse(JSON.parse(record.contentJson));
    const source = await loadReportGenerationInput(record.reviewWorkflowId, user.id);
    const validation = validateDevelopmentReport(report, source);
    if (!validation.valid) throw new Error(validation.issues.join(" | "));
    const markdown = renderDevelopmentReportMarkdown(report, { version: record.version, createdAt: record.createdAt.toISOString() });
    const filename = `agentforge-report-${record.id}-v${record.version}.md`;
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: { code: "REPORT_EXPORT_BLOCKED", message: "Export was blocked because the stored report no longer passes validation." } }, { status: 422 });
  }
}
