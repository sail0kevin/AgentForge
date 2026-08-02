import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { renderProductUIReportGroupMarkdown, renderProductUISpecMarkdown } from "@/lib/report/product-ui-export";
import { mapProductUIReportGroup } from "@/lib/report/product-ui-group-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.productUIReportGroup.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "PRODUCT_UI_GROUP_NOT_FOUND", message: "Product/UI report group not found." } }, { status: 404 });
  const group = mapProductUIReportGroup(record);
  const solutionId = new URL(request.url).searchParams.get("solutionId");
  const selected = solutionId ? group.reports.find((report) => report.productUISpec?.solutionId === solutionId) : null;
  if (solutionId && !selected) return Response.json({ error: { code: "PRODUCT_UI_SOLUTION_NOT_FOUND", message: "Product/UI solution not found." } }, { status: 404 });
  const markdown = selected
    ? renderProductUISpecMarkdown(selected, { generatedAt: group.createdAt })
    : renderProductUIReportGroupMarkdown(group.reports, { generatedAt: group.createdAt });
  const suffix = selected ? `-${selected.productUISpec?.solutionId}` : "-all-solutions";
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="agentforge-product-ui-${group.groupId}${suffix}.md"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
