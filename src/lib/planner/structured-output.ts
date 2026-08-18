import type { z } from "zod";

/**
 * 增强的JSON提取，支持更多格式容错
 * 改进方向：
 * 1. 提取Markdown代码块
 * 2. 提取第一个完整JSON对象/数组
 * 3. 修复常见错误（尾部逗号、单引号）
 */
function extractJson(content: string): unknown {
  const trimmed = content.trim();

  // 1. 尝试提取Markdown代码块
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {
      // 继续尝试修复
    }
  }

  // 2. 尝试提取第一个完整JSON对象或数组
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // 继续尝试修复
    }
  }

  // 3. 尝试修复常见错误
  const toFix = fenced ?? (jsonMatch?.[1]) ?? trimmed;
  const fixed = toFix
    .replace(/,(\s*[}\]])/g, '$1')  // 删除尾部逗号
    .replace(/'/g, '"');  // 单引号替换为双引号

  return JSON.parse(fixed);
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
  let lastRawContent = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const rawContent = await input.generate(prompt, attempt);
      lastRawContent = rawContent;
      const parsed = input.schema.safeParse(extractJson(rawContent));
      if (parsed.success) {
        lastIssues = input.validate?.(parsed.data) ?? [];
        if (lastIssues.length === 0) return parsed.data;
      } else {
        lastIssues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      }
    } catch (error) {
      // 记录原始内容的前200字符，便于诊断
      const preview = lastRawContent.slice(0, 200);
      console.error(`[Structured Output] JSON parse failed on attempt ${attempt}. Preview: ${preview}`);
      lastIssues = [error instanceof Error ? error.message : "Invalid JSON"];
    }
    prompt = `${input.prompt}\n\n上一次输出无效。只返回符合 JSON Schema 的 JSON，不要 Markdown。错误：\n${lastIssues.join("\n")}`;
  }
  throw new StructuredOutputError(maxAttempts, lastIssues);
}
