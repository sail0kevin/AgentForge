import { z } from "zod";

/**
 * Provider 枚举
 *
 * 作用：定义所有支持的模型供应商类型
 * 原理：用 zod 的 enum 类型做运行时校验，防止传入不合法的供应商名称
 * 如何调用：providerSchema.parse("openai") 通过 | providerSchema.parse("xxx") 报错
 */
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

/**
 * Manual Run 请求体校验模式
 *
 * 作用：校验前端发送过来的对话请求，确保数据格式正确
 * 原理：逐层嵌套校验——先校验 input，再校验 agents 数组，最后校验 knowledgeSnippets
 * 如何调用：manualRunSchema.parse(requestBody) 通过 | manualRunSchema.parse({}) 报详细错误
 */
export const manualRunSchema = z.object({
  input: z.string().min(1).max(8000),
  agentIds: z.array(z.string().min(1)).min(1).max(12),
  useRag: z.boolean().optional().default(false),
  knowledgeSnippets: z.array(knowledgeSnippetSchema).max(50).optional().default([]),
});


/**
 * 安全解析 Agent config 字段中的 capabilityIds 数组
 *
 * 作用：从 Prisma Agent 对象的 config JSON 字符串中解析出 capabilityIds 数组
 * 原理：JSON.parse 在 strict 模式下返回 JsonValue 类型，需要显式校验和转换
 * 参数：config - JSON 字符串，例如 '["rag","memory"]'
 * 返回：string[] - 解析后的能力 ID 数组，解析失败返回空数组
 * 如何调用：const ids = parseCapabilityIds(agent.config);
 */
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


/**
 * 解析 Agent config JSON 中的元数据
 *
 * 作用：从 Agent.config 字段解析 capabilityIds 和 apiUrl 等非敏感元数据
 * 原理：早期版本仅存储 capabilityIds 数组，现扩展为对象，需向后兼容
 * 参数：config - JSON 字符串，可能是 '["rag"]' 或 '{"capabilityIds":[],"apiUrl":"..."}'
 * 返回：{ capabilityIds: string[], apiUrl: string }
 */
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
