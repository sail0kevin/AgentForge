import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print the en block (lines 157 onwards)
for i in range(156, min(len(lines), 340)):
    print(f"{i+1}: {lines[i].rstrip()}")
