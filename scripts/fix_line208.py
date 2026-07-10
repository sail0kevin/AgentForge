import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Replace line 208 with a proper string
lines[207] = '        content: "我看到你的输入，但这个 Agent 的模型调用失败了。\\n\\n失败原因：" + errorMessage,\n'

with open('src/app/api/workspaces/manual/run/route.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('Fixed line 208 by direct index replacement')
