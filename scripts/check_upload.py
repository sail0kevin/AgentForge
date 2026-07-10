import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the uploadDocument function signature
for i in range(470, 490):
    print(f"{i+1}: {lines[i].rstrip()[:120]}")
