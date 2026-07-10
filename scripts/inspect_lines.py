import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print line 208 (0-indexed: 207) raw content
line = lines[207]
print(f"Line 208: {repr(line)}")
print()
# Also print line 242
line2 = lines[241]
print(f"Line 242: {repr(line2)}")
