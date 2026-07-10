import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

opens = content.count('{')
closes = content.count('}')
print(f"Open braces: {opens}")
print(f"Close braces: {closes}")
print(f"Difference: {opens - closes}")
