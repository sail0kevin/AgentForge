import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
# Print last 10 lines
for i in range(len(lines)-10, len(lines)):
    print(f"{i+1}: {repr(lines[i])}")
