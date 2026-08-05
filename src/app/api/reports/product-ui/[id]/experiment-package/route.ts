import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapProductUIReportGroup } from "@/lib/report/product-ui-group-service";
import { ProductUIImplementationEvaluationModelSchema } from "@/lib/report/product-ui-implementation-evaluation";
import { buildProductUIImplementationExperimentPackage } from "@/lib/report/product-ui-implementation-experiment-package";
import { z } from "zod";

export const runtime = "nodejs";

const ExperimentPackageRequestSchema = z.object({
  solutionId: z.string().trim().min(1).max(160),
  studyId: z.string().trim().min(1).max(160),
  caseId: z.string().trim().min(1).max(160),
  downstreamModel: ProductUIImplementationEvaluationModelSchema,
  minimumCaseCount: z.number().int().min(1).max(500).optional(),
  minimumRaterCount: z.number().int().min(1).max(50).optional(),
  humanReviewRubricVersion: z.string().trim().min(1).max(160),
}).strict();

function safeFilenameSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const parsed = ExperimentPackageRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: { code: "PRODUCT_UI_EXPERIMENT_PACKAGE_INVALID", message: parsed.error.issues[0]?.message ?? "Invalid experiment package input." } }, { status: 400 });
  }

  const { id } = await context.params;
  const record = await prisma.productUIReportGroup.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "PRODUCT_UI_GROUP_NOT_FOUND", message: "Product/UI report group not found." } }, { status: 404 });

  const group = mapProductUIReportGroup(record);
  const report = group.reports.find((item) => item.productUISpec?.solutionId === parsed.data.solutionId);
  if (!report?.productUISpec) return Response.json({ error: { code: "PRODUCT_UI_SOLUTION_NOT_FOUND", message: "Product/UI solution not found." } }, { status: 404 });

  // 仅打包冻结的报告输入和盲评材料；这里不会调用模型、生成网站或伪造实验结论。
  const experimentPackage = buildProductUIImplementationExperimentPackage({
    studyId: parsed.data.studyId,
    caseId: parsed.data.caseId,
    group,
    report,
    downstreamModel: parsed.data.downstreamModel,
    minimumCaseCount: parsed.data.minimumCaseCount,
    minimumRaterCount: parsed.data.minimumRaterCount,
    humanReviewRubricVersion: parsed.data.humanReviewRubricVersion,
  });
  const filename = `agentforge-product-ui-experiment-${safeFilenameSegment(group.groupId)}-${safeFilenameSegment(report.productUISpec.solutionId)}.json`;

  return new Response(`${JSON.stringify(experimentPackage, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}