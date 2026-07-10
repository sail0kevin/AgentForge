import os

# Add parseCapabilityIds helper to validation.ts
validation_path = r'src/lib/validation.ts'
with open(validation_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add helper function at the end
helper = """

/**
 * 安全解析 Agent config 字段中的 capabilityIds 数组
 *
 * 作用：从 Prisma Agent 对象的 config JSON 字符串中解析出 capabilityIds 数组
 * 原理：JSON.parse 在 strict 模式下返回 JsonValue 类型，需要显式校验和转换
 * 参数：config - JSON 字符串，例如 '["rag","memory"]'
 * 返回：string[] - 解析后的能力 ID 数组，解析失败返回空数组
 * 如何调用：const ids = parseCapabilityIds(agent.config);
 */
export function parseCapabilityIds(config: string | null | undefined): string[] {
  if (!config) return [];
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
"""

if "parseCapabilityIds" not in content:
    content = content.rstrip() + "\n" + helper
    with open(validation_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added parseCapabilityIds to validation.ts")
else:
    print("parseCapabilityIds already exists")

# Fix src/app/api/agents/route.ts
path1 = r'src/app/api/agents/route.ts'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if "parseCapabilityIds" not in content:
    content = content.replace(
        'import { agentCreateSchema } from "@/lib/validation";',
        'import { agentCreateSchema, parseCapabilityIds } from "@/lib/validation";'
    )

# Fix the JSON.parse line
content = content.replace(
    'capabilityIds: JSON.parse(agent.config || "[]") as string[],',
    'capabilityIds: parseCapabilityIds(agent.config),'
)

with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed route.ts")

# Fix src/app/api/agents/[id]/route.ts
path2 = r'src/app/api/agents/[id]/route.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if "parseCapabilityIds" not in content:
    content = content.replace(
        'import { agentUpdateSchema } from "@/lib/validation";',
        'import { agentUpdateSchema, parseCapabilityIds } from "@/lib/validation";'
    )

# Fix the JSON.parse lines
content = content.replace(
    'capabilityIds: JSON.parse(agent.config || "[]") as string[],',
    'capabilityIds: parseCapabilityIds(agent.config),'
)
content = content.replace(
    'capabilityIds: body.capabilityIds ?? (JSON.parse(agent.config || "[]") as string[]),',
    'capabilityIds: body.capabilityIds ?? parseCapabilityIds(agent.config),'
)

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed [id]/route.ts")
