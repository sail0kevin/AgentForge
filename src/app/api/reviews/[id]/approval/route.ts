import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { ApprovalDecisionSchema } from "@/lib/review/contracts";
import { decideReviewWorkflow, mapReviewWorkflow } from "@/lib/review/prisma-review";

export const runtime = "nodejs";

const approvalRequestSchema = z.object({
  decision: ApprovalDecisionSchema,
  note: z.string().trim().max(4_000).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  let body: z.infer<typeof approvalRequestSchema>;
  try {
    body = approvalRequestSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : "Invalid approval request.";
    return Response.json({ error: { code: "INVALID_REQUEST", message } }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const record = await decideReviewWorkflow({ id, userId: user.id, decision: body.decision, note: body.note });
    return Response.json({ review: mapReviewWorkflow(record) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REVIEW_APPROVAL_FAILED";
    const status = code === "REVIEW_NOT_FOUND" ? 404 : code === "REVIEW_ALREADY_DECIDED" || code === "REVIEW_DECISION_CONFLICT" ? 409 : 422;
    const message = code === "REVIEW_NOT_FOUND" ? "Review not found." : code === "REVIEW_ALREADY_DECIDED" ? "This review already has a different final decision." : "The review cannot accept this decision in its current state.";
    return Response.json({ error: { code, message } }, { status });
  }
}
