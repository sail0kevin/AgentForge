import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

# The zh block is lines 56-156 (0-indexed: 55-155)
# I need to replace these lines with correct Chinese content
# Let me read the file, find those lines, and replace them

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

# Verify the first bad line
print(f"Line 58: {repr(lines[57][:100])}")
print(f"Line 59: {repr(lines[58][:100])}")
