# fix-import-parseAgentMeta.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)

p = os.path.join(ROOT, r"src\app\api\agents\route.ts")
c = read(p)

# Add parseAgentMeta to import
old_import = 'import { agentCreateSchema, parseCapabilityIds } from "@/lib/validation";'
new_import = 'import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";'

if old_import in c:
    c = c.replace(old_import, new_import)
    write(p, c)
    print("[OK] route.ts imports parseAgentMeta")
else:
    print("WARN: import line not found")
    print("First import:", c.split(';')[0])
