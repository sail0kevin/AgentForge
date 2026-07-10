import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/app/api/workspaces/manual/run/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix line 208 - replace the entire broken content line
# The garbled text needs to be replaced with a proper string
content = content.replace(
    'content: �ҿ�����������룬����� Agent ��ģ�͵���ʧ�ܡ�\\\\n\\\\nʧ��ԭ��,',
    'content: "I see your input, but this agent model call failed.\\n\\nFailure reason: " + errorMessage'
)

# Fix line 242 - broken map with just "- "
content = content.replace(
    '...capabilityDescriptions.map((description) => - ),',
    '...capabilityDescriptions.map((description) => `- ${description}`),'
)

with open('src/app/api/workspaces/manual/run/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('manual run route fixed v2')
