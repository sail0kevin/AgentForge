import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
# Print lines 205-212 with repr
for i in range(205, 212):
    print(f"Line {i+1}: {repr(lines[i])}")
