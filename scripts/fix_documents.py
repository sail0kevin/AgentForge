import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

# Fix documents route
with open('src/app/api/documents/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('{ error: Unsupported file format:  }', '{ error: "Unsupported file format" }')
with open('src/app/api/documents/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('documents route fixed')
