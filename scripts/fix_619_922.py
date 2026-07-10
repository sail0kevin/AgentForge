import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 619: The nested template literal issue
# The problem: we have ${language === "zh" ? "..." : "..."} inside a template literal
# But the inner quotes conflict with the outer template literal
# Actually the issue is the inner " but the original code used double quotes inside ${}
# which is fine in template literals...
# Let me check: the issue might be that the string contains unescaped quotes
# Actually looking at it again: the inner template literal expressions use " which is fine
# The real issue might be that the line was corrupted during the zh block replacement

# Let me just rewrite line 619 completely
lines[618] = '            content: language === "zh" ? `我看到你的输入: ${prompt}\\\\n\\\\n但这次模型调用没有成功: ${runError instanceof Error ? runError.message : t.sendFailed}` : `I saw your input: ${prompt}\\\\n\\\\nBut the model call did not succeed: ${runError instanceof Error ? runError.message : t.sendFailed}`,\n'

# Fix line 922: the "鈥? is a corrupted empty string
lines[921] = '                    {props.t.apiUrlLabel}: {agent.apiUrl || "-"}\n'

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed lines 619 and 922')
