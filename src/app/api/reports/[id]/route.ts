import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapReportArtifact } from "@/lib/report/prisma-report";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.reportArtifact.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "REPORT_NOT_FOUND", message: "Report not found." } }, { status: 404 });
  return Response.json({ report: mapReportArtifact(record) });
}
