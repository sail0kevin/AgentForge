# fix-import-agentstore.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"
p = os.path.join(ROOT, r"src\store\agent-store.ts")
with open(p, "r", encoding="utf-8") as f:
    c = f.read()

old = 'import { agentCreateSchema, parseCapabilityIds } from "@/lib/validation";'
new = 'import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";'

# Check current state (no import at all currently after our re-write?)
print("Has agentCreateSchema import:", 'agentCreateSchema' in c)
print("Has parseCapabilityIds:", 'parseCapabilityIds' in c)

# Find the import line
idx = c.find('import {')
if idx >= 0:
    end = c.find('\n', idx)
    print("Current import line:", repr(c[idx:end]))
