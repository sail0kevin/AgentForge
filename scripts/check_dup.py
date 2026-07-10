import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check lines 440-470 for the duplicate comment issue
for i in range(439, 470):
    print(f"{i+1}: {lines[i].rstrip()[:150]}")
