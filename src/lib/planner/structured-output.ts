import type { z } from "zod";

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  return JSON.parse(fenced);
}

export class StructuredOutputError extends Error {
  readonly code = "STRUCTURED_OUTPUT_INVALID";
  constructor(readonly attempts: number, readonly issues: string[]) {
    super(`Structured output remained invalid after ${attempts} attempts.`);
    this.name = "StructuredOutputError";
  }
}

/** 最多尝试 maxAttempts 次；失败不会把自由文本当成合法计划。 */
export async function generateStructuredOutput<T>(input: {
  schema: z.ZodType<T>;
  prompt: string;
  generate: (prompt: string, attempt: number) => Promise<string>;
  validate?: (value: T) => string[];
  maxAttempts?: number;
}): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 2, 3));
  let prompt = input.prompt;
  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const parsed = input.schema.safeParse(extractJson(await input.generate(prompt, attempt)));
      if (parsed.success) {
        lastIssues = input.validate?.(parsed.data) ?? [];
        if (lastIssues.length === 0) return parsed.data;
      } else {
        lastIssues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      }
    } catch (error) {
      lastIssues = [error instanceof Error ? error.message : "Invalid JSON"];
    }
    prompt = `${input.prompt}\n\n上一次输出无效。只返回符合 JSON Schema 的 JSON，不要 Markdown。错误：\n${lastIssues.join("\n")}`;
  }
  throw new StructuredOutputError(maxAttempts, lastIssues);
}
