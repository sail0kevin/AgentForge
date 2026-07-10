import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the ChatWorkspace function and extract the full return JSX
idx = content.find('function ChatWorkspace')
end_idx = content.find('function ChatWorkspace', idx + 1)
if end_idx < 0:
    end_idx = idx + 3000

snippet = content[idx:end_idx]
print(snippet)
