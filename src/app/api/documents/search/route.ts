import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { searchDocumentChunks } from "@/lib/rag/document-service";

export const runtime = "nodejs";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

/** 返回当前用户知识库中带文档、章节、行号、版本和许可的引用结果。 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  try {
    const body = searchSchema.parse(await request.json());
    return Response.json({ results: await searchDocumentChunks(user.id, body.query, body.limit) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_SEARCH", message: error.issues[0]?.message } }, { status: 400 });
    return Response.json({ error: { code: "KNOWLEDGE_SEARCH_FAILED", message: "Failed to search the current user's knowledge library." } }, { status: 500 });
  }
}
