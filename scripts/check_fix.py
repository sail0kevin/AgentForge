import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print lines 58-67 to see what the gbk fix produced
for i in range(57, 67):
    print(f"Line {i+1}: {lines[i].rstrip()}")
