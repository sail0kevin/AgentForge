import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print lines 458-468
for i in range(457, 468):
    print(f"{i+1}: {repr(lines[i])}")
print()
print("---")
print()
# Print lines 620-626
for i in range(619, 627):
    print(f"{i+1}: {repr(lines[i])}")
