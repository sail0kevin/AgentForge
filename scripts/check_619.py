import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Print line 619
print(f"Line 619: {repr(lines[618])}")
print()
# Print line 922
print(f"Line 922: {repr(lines[921])}")
