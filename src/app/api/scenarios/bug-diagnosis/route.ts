import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { runBugDiagnosisWorkflow } from "@/lib/scenarios/bug-diagnosis-workflow";

export const runtime = "nodejs";

/**
 * Bug 诊断只关联用户提交的日志和代码上下文；候选根因必须经过后续验证，接口不会声称已经修复问题。
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

  try {
    const body = await request.json() as { errorLog?: unknown; codeContext?: unknown };
    const report = await runBugDiagnosisWorkflow({
      errorLog: body.errorLog as string,
      codeContext: body.codeContext as never,
    });
    return Response.json({ report }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_BUG_DIAGNOSIS_INPUT", message: error.issues[0]?.message ?? "Invalid bug diagnosis input." } }, { status: 400 });
    }
    return Response.json({ error: { code: "BUG_DIAGNOSIS_FAILED", message: "Bug diagnosis could not be completed safely." } }, { status: 422 });
  }
}
