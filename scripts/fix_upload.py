import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 473 is "    setDocumentUploading(true);"
# We need to insert the function signature before it
# Insert at index 472 (before line 473)
lines.insert(472, "  async function uploadDocument(file: File) {\n")

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed uploadDocument signature")
