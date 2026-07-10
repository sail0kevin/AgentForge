# fix-agent-schema.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)

# ============ Fix 1: POST /api/agents store apiUrl/apiKey so they persist ============
p1 = os.path.join(ROOT, r"src\app\api\agents\route.ts")
c1 = read(p1)

# Add apiUrl/apiKey fields to schema and POST handler
# First update agentCreateSchema
old_schema = '''export const agentCreateSchema = z.object({
  name: z.string().min(1).max(80),
  avatar: z.string().min(1).max(8).default("AI"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#38bdf8"),
  provider: providerSchema,
  model: z.string().min(1).max(120),
  systemPrompt: z.string().min(10),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  maxTokens: z.coerce.number().int().min(128).max(8000).default(1200),
});'''

new_schema = '''export const agentCreateSchema = z.object({
  name: z.string().min(1).max(80),
  avatar: z.string().min(1).max(8).default("AI"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#38bdf8"),
  provider: providerSchema,
  model: z.string().min(1).max(120),
  systemPrompt: z.string().min(10),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  maxTokens: z.coerce.number().int().min(128).max(8000).default(1200),
  apiUrl: z.string().max(500).optional().default(""),
  apiKey: z.string().max(500).optional().default(""),
});'''

if old_schema in c1:
    c1 = c1.replace(old_schema, new_schema, 1)
    print("[OK] agentCreateSchema extended with apiUrl/apiKey")
else:
    print("[WARN] agentCreateSchema not found unchanged")

# Update POST handler to persist apiUrl/apiKey
old_create_data = '''    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        name: data.name,
        avatar: data.avatar,
        color: data.color,
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        config: JSON.stringify(body.capabilityIds ?? []),
      },
    });'''

new_create_data = '''    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        name: data.name,
        avatar: data.avatar,
        color: data.color,
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        config: JSON.stringify({ capabilityIds: body.capabilityIds ?? [], apiUrl: data.apiUrl ?? "", apiKey: data.apiKey ?? "" }),
      },
    });'''

if old_create_data in c1:
    c1 = c1.replace(old_create_data, new_create_data, 1)
    print("[OK] POST /api/agents handler now stores apiUrl/apiKey in config")
else:
    print("[WARN] POST agent.create block not found unchanged")

# Update GET handler to include parsed apiUrl/apiKey
old_get_result = '''    const result = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilityIds: parseCapabilityIds(agent.config),
    }));'''

new_get_result = '''    const result = agents.map((agent) => {
      const meta = parseAgentMeta(agent.config);
      return {
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        color: agent.color,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        capabilityIds: meta.capabilityIds,
        apiUrl: meta.apiUrl,
        apiKey: meta.apiKey,
      };
    });'''

if old_get_result in c1:
    c1 = c1.replace(old_get_result, new_get_result, 1)
    print("[OK] GET /api/agents handler now returns apiUrl/apiKey")
else:
    print("[WARN] GET agents.map block not found unchanged")

# Update POST response to include parsed apiUrl/apiKey
old_post_resp = '''    return Response.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilityIds: body.capabilityIds ?? [],
    }, { status: 201 });'''

new_post_resp = '''    return Response.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilityIds: body.capabilityIds ?? [],
      apiUrl: data.apiUrl ?? "",
      apiKey: data.apiKey ?? "",
    }, { status: 201 });'''

if old_post_resp in c1:
    c1 = c1.replace(old_post_resp, new_post_resp, 1)
    print("[OK] POST response returns apiUrl/apiKey")
else:
    print("[WARN] POST Response.json block not found unchanged")

write(p1, c1)
print(f"\nagents/route.ts done.")

# ============ Fix 2: validation.ts - add parseAgentMeta helper ============
p2 = os.path.join(ROOT, r"src\lib\validation.ts")
c2 = read(p2)

if "function parseAgentMeta" not in c2:
    addition = '''

/**
 * 解析 Agent config JSON 中的元数据
 *
 * 作用：从 Agent.config 字段解析 capabilityIds、apiUrl、apiKey 等元数据
 * 原理：早期版本仅存储 capabilityIds 数组，现扩展为对象，需向后兼容
 * 参数：config - JSON 字符串，可能是 '["rag"]' 或 '{"capabilityIds":[],"apiUrl":"..."}'
 * 返回：{ capabilityIds: string[], apiUrl: string, apiKey: string }
 */
export function parseAgentMeta(config: unknown): { capabilityIds: string[]; apiUrl: string; apiKey: string } {
  if (typeof config !== "string") return { capabilityIds: [], apiUrl: "", apiKey: "" };
  try {
    const parsed = JSON.parse(config);
    if (Array.isArray(parsed)) {
      return { capabilityIds: parsed.filter((x): x is string => typeof x === "string"), apiUrl: "", apiKey: "" };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        capabilityIds: Array.isArray(obj.capabilityIds) ? obj.capabilityIds.filter((x): x is string => typeof x === "string") : [],
        apiUrl: typeof obj.apiUrl === "string" ? obj.apiUrl : "",
        apiKey: typeof obj.apiKey === "string" ? obj.apiKey : "",
      };
    }
    return { capabilityIds: [], apiUrl: "", apiKey: "" };
  } catch {
    return { capabilityIds: [], apiUrl: "", apiKey: "" };
  }
}
'''
    c2 = c2.rstrip() + "\n" + addition
    write(p2, c2)
    print("[OK] validation.ts extended with parseAgentMeta")
else:
    print("[OK] validation.ts already has parseAgentMeta")

# ============ Fix 3: agent-store.ts - toLocalAgent uses parseAgentMeta ============
p3 = os.path.join(ROOT, r"src\store\agent-store.ts")
c3 = read(p3)

old_import = 'import { agentCreateSchema, parseCapabilityIds } from "@/lib/validation";'
new_import = 'import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";'
if old_import in c3:
    c3 = c3.replace(old_import, new_import, 1)
    print("[OK] agent-store imports parseAgentMeta")

# Update toLocalAgent to use meta
old_local = '''  return {
    id: record.id,
    name: record.name,
    avatar: record.avatar,
    color: record.color,
    provider: record.provider as Provider,
    model: record.model,
    systemPrompt: record.systemPrompt,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    capabilityIds: record.capabilityIds ?? [],
    enabled: true,
    source: providerToSource(record.provider),
    apiUrl: record.apiUrl ?? sourceToApiUrl(providerToSource(record.provider)),
    apiKey: record.apiKey ?? "",
    tools: [],
  };'''

new_local = '''  const meta = parseAgentMeta((record as { config?: unknown }).config);
  const source = providerToSource(record.provider);
  return {
    id: record.id,
    name: record.name,
    avatar: record.avatar,
    color: record.color,
    provider: record.provider as Provider,
    model: record.model,
    systemPrompt: record.systemPrompt,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    capabilityIds: record.capabilityIds ?? meta.capabilityIds,
    enabled: true,
    source,
    apiUrl: record.apiUrl ?? meta.apiUrl ?? sourceToApiUrl(source),
    apiKey: record.apiKey ?? meta.apiKey,
    tools: [],
  };'''

if old_local in c3:
    c3 = c3.replace(old_local, new_local, 1)
    print("[OK] toLocalAgent uses parseAgentMeta")
else:
    print("[WARN] toLocalAgent unchanged block not found")

write(p3, c3)

print("\nAll schema/store fixes applied.")
