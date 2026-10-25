import { z } from "zod";

/** 支持的模型供应商枚举，zod enum 提供运行时校验。 */
export const providerSchema = z.enum(["openai", "anthropic", "deepseek", "ollama", "custom"]);
export const workspaceModeSchema = z.enum(["sequential", "debate"]);

export const apiKeyCreateSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().min(8),
});

// API 地址只允许 HTTP(S)，并拒绝 URL 中携带的账号密码，避免把凭证误写入地址字段。
const apiUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "API 地址必须是安全的 HTTP(S) URL，且不能包含账号或密码。");

// 空字符串表示编辑时不修改已保存的密钥；只有非空值才会被加密写入数据库。
const optionalAgentApiKeySchema = z.union([z.literal(""), z.string().trim().min(8)]).optional();

export const agentCreateSchema = z.object({
  name: z.string().min(1).max(80),
  avatar: z.string().min(1).max(8).default("AI"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#38bdf8"),
  provider: providerSchema,
  model: z.string().min(1).max(120),
  systemPrompt: z.string().trim().min(1, "角色设定不能为空。"),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  maxTokens: z.coerce.number().int().min(128).max(8000).default(1200),
  apiUrl: apiUrlSchema.optional().default(""),
  apiKey: optionalAgentApiKeySchema,
});

export const agentUpdateSchema = agentCreateSchema.partial();

export const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().default(""),
  mode: workspaceModeSchema.default("sequential"),
  budgetLimit: z.coerce.number().positive().default(10),
  agentIds: z.array(z.string().min(1)).max(12).refine((ids) => new Set(ids).size === ids.length, "agentIds must be unique").default([]),
});

export const workspaceUpdateSchema = workspaceCreateSchema.partial();

export const runWorkspaceSchema = z.object({
  input: z.string().min(1).max(8000),
});

export const knowledgeSnippetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(6000),
  createdAt: z.string().min(1),
});

/** 前端对话请求体校验。 */
export const manualRunSchema = z.object({
  input: z.string().min(1).max(8000),
  agentIds: z.array(z.string().min(1)).min(1).max(12),
  useRag: z.boolean().optional().default(false),
  knowledgeSnippets: z.array(knowledgeSnippetSchema).max(50).optional().default([]),
});


/** 从 Prisma Agent 的 config JSON 字符串解析 capabilityIds，解析失败返回空数组。 */
export function parseCapabilityIds(config: unknown): string[] {
  if (typeof config !== "string") return [];
  try {
    const parsed = JSON.parse(config);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}


/** 解析 Agent config 中的 capabilityIds 与 apiUrl；早期版本仅存数组，需兼容两种形态。 */
export function parseAgentMeta(config: unknown): { capabilityIds: string[]; apiUrl: string } {
  if (typeof config !== "string") return { capabilityIds: [], apiUrl: "" };
  try {
    const parsed = JSON.parse(config);
    if (Array.isArray(parsed)) {
      return { capabilityIds: parsed.filter((x): x is string => typeof x === "string"), apiUrl: "" };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        capabilityIds: Array.isArray(obj.capabilityIds) ? obj.capabilityIds.filter((x): x is string => typeof x === "string") : [],
        apiUrl: typeof obj.apiUrl === "string" ? obj.apiUrl : "",
      };
    }
    return { capabilityIds: [], apiUrl: "" };
  } catch {
    return { capabilityIds: [], apiUrl: "" };
  }
}
