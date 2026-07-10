import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

line = lines[207]
print("Line 208 raw bytes:")
print(line.encode('utf-8'))
print()
print("Line 208 repr:")
print(repr(line))
