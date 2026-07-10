import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The loadDocuments function should be a simple fetch to /api/documents
# Based on the pattern of uploadDocument, loadDocuments should be:
# async function loadDocuments() {
#   try {
#     const response = await fetch("/api/documents");
#     if (response.ok) {
#       const data = await response.json();
#       setDocuments(data);
#     }
#   } catch {
// ignore
#   }
# }

# Insert the function body between line 460 and 461
load_docs_body = [
    "  async function loadDocuments() {\n",
    "    try {\n",
    '      const response = await fetch("/api/documents");\n',
    "      if (response.ok) {\n",
    "        const data = await response.json();\n",
    "        setDocuments(data as DocumentItem[]);\n",
    "      }\n",
    "  } catch {\n",
    "      // ignore\n",
    "    }\n",
    "  }\n",
    "\n",
]

# Replace line 460 (just the function signature) with signature + body
lines[460:461] = load_docs_body

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed loadDocuments function body")
