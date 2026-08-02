import { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { loadReportGenerationInput } from "@/lib/report/prisma-report";
import { GitHubEvidenceSchema, ProductUISolutionTypeSchema } from "@/lib/report/contracts";
import { buildDownstreamAgentPrompt, renderProductUIReportGroupMarkdown } from "@/lib/report/product-ui-export";
import { createProductUIReportGroup } from "@/lib/report/product-ui-report";

export const runtime = "nodejs";

const requestSchema = z.object({
  reviewWorkflowId: z.string().min(1),
  groupId: z.string().min(1).max(120).optional(),
  solutionTypes: z.array(ProductUISolutionTypeSchema).min(2).max(3).optional(),
  evidence: GitHubEvidenceSchema.array().min(1).max(30).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid product/UI report request.";
    return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
  }

  try {
    const source = await loadReportGenerationInput(body.reviewWorkflowId, user.id);
    const group = createProductUIReportGroup(source, {
      groupId: body.groupId,
      solutionTypes: body.solutionTypes,
      evidence: body.evidence,
    });
    return Response.json({
      group,
      markdown: renderProductUIReportGroupMarkdown(group.reports, { generatedAt: new Date().toISOString() }),
      prompts: group.reports.map((report) => ({ solutionId: report.productUISpec?.solutionId, prompt: buildDownstreamAgentPrompt(report) })),
      persistence: "not_persisted",
      status: "target_design_generated",
    }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "PRODUCT_UI_REPORT_FAILED";
    const status = code === "REVIEW_NOT_FOUND" ? 404 : code === "REPORT_APPROVAL_REQUIRED" ? 409 : 422;
    return Response.json({ error: { code, message: "Product/UI report generation was blocked by the existing source-chain contract." } }, { status });
  }
}
