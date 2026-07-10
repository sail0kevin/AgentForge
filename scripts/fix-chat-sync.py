# fix-chat-sync.py
import os
import re

ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)

# ============ Fix 1: agent-store.ts addAgent ============
p1 = os.path.join(ROOT, r"src\store\agent-store.ts")
c1 = read(p1)

# The issue: addAgent returns agent but doesn't merge input.source/apiUrl/apiKey
# Ensure returned agent includes these from input
old_block = """      const agent: LocalAgent = {
        ...toLocalAgent(record),
        enabled: true,
        source: input.source,
        apiUrl: input.apiUrl,
        apiKey: input.apiKey,
        tools: input.tools,
      };"""

new_block = """      const agent: LocalAgent = {
        ...toLocalAgent(record),
        enabled: true,
        source: input.source,
        apiUrl: input.apiUrl || sourceToApiUrl(input.source),
        apiKey: input.apiKey || "",
        tools: input.tools ?? [],
        capabilityIds: record.capabilityIds ?? input.capabilityIds ?? [],
      };"""

if old_block in c1:
    c1 = c1.replace(old_block, new_block, 1)
    print(f"[OK] agent-store.ts addAgent return block updated")
else:
    print(f"[WARN] agent-store.ts addAgent old block not found — skipping")

write(p1, c1)

# ============ Fix 2: page.tsx remove demo-data dep ============
p2 = os.path.join(ROOT, r"src\app\page.tsx")
if os.path.exists(p2):
    c2 = read(p2)
    if "demo-data" in c2 or "demoWorkspace" in c2:
        c2 = """import { WorkspaceApp } from "@/components/workspace/workspace-app";

export default function Home() {
  return <WorkspaceApp initialWorkspace={{ id: "local", name: "Local Workspace", agents: [], messages: [], totalSpent: 0, status: "idle" }} />;
}
"""
        write(p2, c2)
        print(f"[OK] page.tsx rewritten to remove demo-data dep")
    else:
        print(f"[OK] page.tsx already clean")
else:
    print(f"[SKIP] page.tsx not found")

print("\nDone. All fixes applied.")
