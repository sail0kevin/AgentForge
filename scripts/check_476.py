import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 476 (0-indexed 475) has "async function uploadDocument(file: File)"
# but the error says "Cannot find name file" at column 31
# Let me check the line
print(f"Line 476: {repr(lines[475])}")
