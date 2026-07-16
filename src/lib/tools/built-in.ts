import { z } from "zod";
import { searchDocumentChunks } from "@/lib/rag/document-service";
import { registerTool, type ToolDefinition } from "./registry";

const citationSchema = z.object({
  documentId: z.string(), title: z.string(), fileName: z.string(), sourceType: z.string(), sourceUrl: z.string().nullable(),
  sourceVersion: z.string(), license: z.string(), reviewedAt: z.string().nullable(), checksumSha256: z.string(),
  headingPath: z.string().nullable(), startLine: z.number().int().nonnegative(), endLine: z.number().int().nonnegative(),
});

const knowledgeSearchTool: ToolDefinition<{ query: string; limit: number }, { results: Awaited<ReturnType<typeof searchDocumentChunks>> }> = {
  id: "knowledge-search",
  name: "Local Knowledge Search",
  description: "Search only the authenticated user's versioned local document library and return traceable citations.",
  permission: "knowledge:read",
  risk: "read-only",
  inputSchema: z.object({ query: z.string().trim().min(2).max(2_000), limit: z.number().int().min(1).max(10).optional().default(5) }),
  outputSchema: z.object({ results: z.array(z.object({ id: z.string(), content: z.string().max(2_000), score: z.number().nonnegative(), citation: citationSchema })).max(10) }),
  timeoutMs: 5_000,
  maxCallsPerRun: 5,
  maxInputBytes: 8 * 1024,
  maxOutputBytes: 64 * 1024,
  async execute(input, context) {
    context.signal.throwIfAborted();
    const results = await searchDocumentChunks(context.userId, input.query, input.limit);
    return { results: results.map((result) => ({ ...result, content: result.content.slice(0, 2_000) })) };
  },
};

const uiAcceptanceInputSchema = z.object({
  pageType: z.string().trim().min(2).max(100),
  hasVisibleLabels: z.boolean(),
  hasKeyboardFocus: z.boolean(),
  coveredStates: z.array(z.enum(["loading", "empty", "success", "warning", "error", "disabled"])).max(6),
});

const uiAcceptanceTool: ToolDefinition<z.infer<typeof uiAcceptanceInputSchema>, { passed: boolean; checks: string[] }> = {
  id: "ui-acceptance-check",
  name: "UI Acceptance Check",
  description: "Run deterministic, read-only baseline checks for labels, keyboard focus and essential UI states.",
  permission: "knowledge:read",
  risk: "read-only",
  inputSchema: uiAcceptanceInputSchema,
  outputSchema: z.object({ passed: z.boolean(), checks: z.array(z.string().max(300)).max(10) }),
  timeoutMs: 1_000,
  maxCallsPerRun: 3,
  maxInputBytes: 4 * 1024,
  maxOutputBytes: 8 * 1024,
  async execute(input) {
    const checks = [
      input.hasVisibleLabels ? "PASS: interactive fields have visible labels." : "FAIL: add visible labels; placeholders alone are insufficient.",
      input.hasKeyboardFocus ? "PASS: keyboard focus is visible." : "FAIL: add a visible keyboard focus indicator.",
      ...(["loading", "empty", "error"] as const).filter((state) => !input.coveredStates.includes(state)).map((state) => `FAIL: ${input.pageType} does not define the ${state} state.`),
    ];
    return { passed: checks.every((check) => check.startsWith("PASS")), checks };
  },
};

export function initBuiltInTools(): void {
  registerTool(knowledgeSearchTool);
  registerTool(uiAcceptanceTool);
}

export const BUILTIN_TOOL_IDS = ["knowledge-search", "ui-acceptance-check"] as const;
