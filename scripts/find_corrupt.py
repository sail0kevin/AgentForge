import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find all lines with problematic characters
for i, line in enumerate(lines):
    # Check for replacement character or other signs of corruption
    if '\ufffd' in line or '\ue000' in line:
        print(f"Line {i+1}: {repr(line[:200])}")
