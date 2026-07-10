import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find loadDocuments
for i, line in enumerate(lines):
    if 'loadDocuments' in line and 'function' in line:
        # Print surrounding lines
        start = max(0, i-1)
        end = min(len(lines), i+15)
        for j in range(start, end):
            print(f"{j+1}: {repr(lines[j])}")
        print("---")
