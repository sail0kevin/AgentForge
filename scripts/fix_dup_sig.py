import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove the duplicate line 460 (0-indexed: 459)
# Line 460 is: "  async function loadDocuments() {\n" (the original signature-only)
# Line 461 is: "  async function loadDocuments() {\n" (the one I inserted with body)
del lines[459:460]

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Removed duplicate loadDocuments signature")
