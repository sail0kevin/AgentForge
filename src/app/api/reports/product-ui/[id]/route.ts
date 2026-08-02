import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ProductUIRuntimeEvidenceSchema } from "@/lib/report/contracts";
import { buildDownstreamAgentPrompt } from "@/lib/report/product-ui-export";
import { mapProductUIReportGroup, updateProductUIReportFeedback } from "@/lib/report/product-ui-group-service";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  solutionId: z.string().min(1).max(120),
  outcome: z.enum(["pass", "needs_revision"]),
  note: z.string().trim().min(1).max(2_000),
  runtimeEvidence: ProductUIRuntimeEvidenceSchema,
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.productUIReportGroup.findFirst({ where: { id, userId: user.id } });
  if (!record) return Response.json({ error: { code: "PRODUCT_UI_GROUP_NOT_FOUND", message: "Product/UI report group not found." } }, { status: 404 });
  const group = mapProductUIReportGroup(record);
  return Response.json({
    group,
    prompts: group.reports.map((report) => ({ solutionId: report.productUISpec?.solutionId, prompt: buildDownstreamAgentPrompt(report) })),
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = feedbackSchema.parse(await request.json());
    const group = await updateProductUIReportFeedback({ id, userId: user.id, ...body });
    return Response.json({ group });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "Invalid feedback." } }, { status: 400 });
    const code = error instanceof Error ? error.message : "PRODUCT_UI_FEEDBACK_FAILED";
    if (code === "PRODUCT_UI_GROUP_NOT_FOUND") return Response.json({ error: { code, message: "Product/UI report group not found." } }, { status: 404 });
    if (code === "PRODUCT_UI_SOLUTION_NOT_FOUND") return Response.json({ error: { code, message: "Product/UI solution not found." } }, { status: 404 });
    return Response.json({ error: { code: "PRODUCT_UI_FEEDBACK_FAILED", message: "Feedback could not be saved." } }, { status: 422 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const { id } = await context.params;
  const record = await prisma.productUIReportGroup.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!record) return Response.json({ error: { code: "PRODUCT_UI_GROUP_NOT_FOUND", message: "Product/UI report group not found." } }, { status: 404 });
  await prisma.productUIReportGroup.delete({ where: { id: record.id } });
  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return Response.json({ methods: ["GET", "PATCH", "DELETE"] });
}
