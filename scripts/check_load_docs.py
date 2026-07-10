import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check the loadDocuments function area (around line 455-470)
for i in range(450, 475):
    print(f"{i+1}: {lines[i].rstrip()[:120]}")
