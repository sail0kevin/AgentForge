# fix-import-agentstore2.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"
p = os.path.join(ROOT, r"src\store\agent-store.ts")
with open(p, "r", encoding="utf-8") as f:
    c = f.read()

old_line = 'import { create } from "zustand";'
new_lines = '''import { create } from "zustand";
import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";'''

if old_line in c:
    c = c.replace(old_line, new_lines, 1)
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)
    print("[OK] import line added to agent-store.ts")
else:
    print("[WARN] zustand import not found")
