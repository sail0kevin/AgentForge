import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the ChatWorkspace function
idx = content.find('function ChatWorkspace')
if idx >= 0:
    # Get the first 500 chars of the function
    snippet = content[idx:idx+500]
    print(snippet)
else:
    print("ChatWorkspace not found")
