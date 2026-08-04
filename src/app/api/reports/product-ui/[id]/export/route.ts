import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  renderProductUIHandoffJson,
  renderProductUIReportGroupMarkdown,
  renderProductUISpecMarkdown,
} from "@/lib/report/product-ui-export";
import { mapProductUIReportGroup } from "@/lib/report/product-ui-group-service";
import { renderProductUIImplementationManifestJson } from "@/lib/report/product-ui-implementation-manifest";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.productUIReportGroup.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "PRODUCT_UI_GROUP_NOT_FOUND", message: "Product/UI report group not found." } }, { status: 404 });
  const group = mapProductUIReportGroup(record);
  const searchParams = new URL(request.url).searchParams;
  const solutionId = searchParams.get("solutionId");
  const format = searchParams.get("format")?.toLowerCase() ?? "markdown";
  if (format !== "markdown" && format !== "json" && format !== "implementation-manifest") {
    return Response.json({ error: { code: "PRODUCT_UI_EXPORT_FORMAT_UNSUPPORTED", message: "Supported formats are markdown, json and implementation-manifest." } }, { status: 400 });
  }
  const selected = solutionId ? group.reports.find((report) => report.productUISpec?.solutionId === solutionId) : null;
  if (solutionId && !selected) return Response.json({ error: { code: "PRODUCT_UI_SOLUTION_NOT_FOUND", message: "Product/UI solution not found." } }, { status: 404 });
  if (format === "implementation-manifest") {
    if (!solutionId || !selected) {
      return Response.json({ error: { code: "PRODUCT_UI_IMPLEMENTATION_MANIFEST_REQUIRES_SOLUTION", message: "solutionId is required for an implementation manifest." } }, { status: 400 });
    }
    // ???????????????? AI ???????????????
    const manifest = renderProductUIImplementationManifestJson(group, selected, { generatedAt: group.createdAt });
    return new Response(manifest, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="agentforge-product-ui-${group.groupId}-${solutionId}-implementation.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (format === "json") {
    const json = renderProductUIHandoffJson(group, { generatedAt: group.createdAt, selectedSolutionId: solutionId });
    const suffix = solutionId ? `-${solutionId}` : "-all-solutions";
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="agentforge-product-ui-${group.groupId}${suffix}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
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
