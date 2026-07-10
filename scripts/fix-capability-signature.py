# Fix parseCapabilityIds to accept unknown type (Prisma 7 SQLite returns JsonValue)
validation_path = r'src/lib/validation.ts'
with open(validation_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_func = """export function parseCapabilityIds(config: string | null | undefined): string[] {
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
}"""

new_func = """export function parseCapabilityIds(config: unknown): string[] {
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
}"""

if old_func in content:
    content = content.replace(old_func, new_func)
    with open(validation_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed parseCapabilityIds signature")
else:
    print("Function signature already updated or not found")
