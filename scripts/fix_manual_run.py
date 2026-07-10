import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: SSE send function - data: should be a proper template literal
content = content.replace(
    'controller.enqueue(encoder.encode(data: \\n\\n));',
    'controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));'
)

# Fix 2: Broken error message string at agent_failed
content = content.replace(
    'content: 鎴戠湅鍒颁簡浣犵殑杈撳叆锛屼絾杩欎釜 Agent 鐨勬ā鍨嬭皟鐢ㄥけ璐ャ€俓n\\n澶辫触鍘熷洜锛?',
    'content: "I see your input, but the agent model call failed.\\n\\nReason: " + errorMessage'
)

# Fix 3: Broken template literal [Previous agent ]: 
content = content.replace(
    'content: [Previous agent ]: ,',
    'content: `[Previous agent ${agent.name}]: ${message.content}`'
)

with open('src/app/api/workspaces/manual/run/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('manual run route fixed')
