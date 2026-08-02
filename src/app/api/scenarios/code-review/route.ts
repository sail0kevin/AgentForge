import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { runCodeReviewWorkflow } from "@/lib/scenarios/code-review-workflow";

export const runtime = "nodejs";

/**
 * 代码审查入口只分析请求中明确提交的源码快照，不读取服务器文件系统，也不执行快照中的代码。
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  try {
    const body = await request.json() as { files?: unknown; reviewGoal?: unknown };
    const report = await runCodeReviewWorkflow({
      files: body.files as never,
      reviewGoal: body.reviewGoal as string | undefined,
    });
    return Response.json({ report }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_CODE_REVIEW_INPUT", message: error.issues[0]?.message ?? "Invalid code review input." } }, { status: 400 });
    }
    return Response.json({ error: { code: "CODE_REVIEW_FAILED", message: "Code review could not be completed safely." } }, { status: 422 });
  }
}
