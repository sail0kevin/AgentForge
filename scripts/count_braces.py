import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Count opening and closing braces
opens = content.count('{')
closes = content.count('}')
print(f"Open braces: {opens}")
print(f"Close braces: {closes}")
print(f"Difference: {opens - closes}")

# Also count parentheses
opens_p = content.count('(')
closes_p = content.count(')')
print(f"Open parens: {opens_p}")
print(f"Close parens: {closes_p}")
print(f"Paren difference: {opens_p - closes_p}')
