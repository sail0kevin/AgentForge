# fix-pagetsx.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)

p = os.path.join(ROOT, r"src\app\page.tsx")
content = '''import { WorkspaceApp } from "@/components/workspace/workspace-app";

export default function Home() {
  return (
    <WorkspaceApp
      initialWorkspace={{
        id: "local",
        name: "Local Workspace",
        description: "Local manual multi-agent run workspace",
        mode: "sequential",
        budgetLimit: 999999,
        agents: [],
        messages: [],
        totalSpent: 0,
        status: "idle",
      }}
    />
  );
}
'''
write(p, content)
print("[OK] page.tsx written with full WorkspaceSnapshot")
