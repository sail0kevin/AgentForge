import os, sys, json
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

# Read the en block from the existing file to get exact formatting
with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The en block is lines 157-257 (1-indexed)
en_block_lines = lines[156:257]

# Extract just the values from en block (the actual English text)
# Build a mapping of key -> Chinese translation
zh_translations = {
    "chat": "对话空间",
    "creator": "创建智能体",
    "tools": "能力库",
    "dashboard": "调用链路",
    "settings": "基础设置",
    "productSubtitle": "多 Agent 工作平台",
    "siderHint": "先创建 Agent，再在对话空间发送消息。当前版本优先保证本地可用。",
    "topDescription": "创建 Agent，输入消息，已启用的 Agent 会在同一对话区依次回复。",
    "language": "语言",
    "zh": "中文",
    "en": "English",
    "loadedAgents": "已添加的智能体",
    "enabledCount": "个启用",
    "currentChat": "当前对话",
    "chatTargetHint": "消息会发送给所有已启用的 Agent。",
    "clearChat": "清空对话",
    "inputPlaceholder": "输入消息，发送给当前启用的 Agent",
    "send": "发送",
    "noAgents": "还没有智能体。",
    "addAgent": "添加智能体",
    "noMessages": "还没有消息。",
    "deleteAgent": "删除智能体",
    "editAgent": "编辑智能体",
    "agentEnabled": "已启用",
    "agentDisabled": "已停用",
    "joinReply": "参与回复",
    "you": "你",
    "thinking": "正在生成...",
    "needName": "请先填写智能体名称。",
    "needPrompt": "角色设定 Prompt 至少需要 10 个字符。",
    "needAgent": "请先添加并启用至少一个智能体。你的消息已保留在对话中。",
    "sanitizedKey": "部分 Agent 的 API Key 包含中文或全角字符，本次已忽略这些 Key 并继续发送。",
    "savedWithSanitizedKey": "已保存 {name}，但 API Key 包含中文或全角字符，本地已忽略该 Key。",
    "agentAdded": "已添加智能体：{name}",
    "agentUpdated": "已更新智能体：{name}",
    "editingAgent": "正在编辑智能体：{name}",
    "editCancelled": "已取消编辑，可以继续创建新的智能体。",
    "callFailed": "模型调用失败。",
    "noStream": "没有收到流式响应。",
    "sendFailed": "发送失败。",
    "clearDone": "对话记录已清空。本地 Agent 配置仍然保留。",
    "currentAgents": "当前智能体",
    "currentAgentsDesc": "这里可以查看、编辑、启用或删除已经创建的智能体。",
    "apiUrlLabel": "API URL",
    "apiKeyConfigured": "已配置密钥",
    "apiKeyMissing": "未配置密钥",
    "capabilityNames": "能力：{names}",
    "emptyAgentsInCreator": "还没有智能体。先在右侧创建一个。",
    "capabilityCount": "个能力",
    "createAgent": "创建智能体",
    "editAgentTitle": "编辑智能体：{name}",
    "createAgentDesc": "填写模型连接信息后，智能体会加入对话空间。",
    "editingHint": "当前正在修改已有智能体，保存后会覆盖原配置。",
    "cancelEdit": "取消编辑",
    "agentName": "智能体名称",
    "agentNamePlaceholder": "例如：需求分析师",
    "rolePrompt": "角色设定 Prompt",
    "promptPlaceholder": "描述这个智能体的职责、语气和输出要求，至少 10 个字符。",
    "modelSource": "模型来源",
    "modelName": "模型名称",
    "apiUrlPlaceholder": "https://api.example.com/v1 或 http://localhost:11434",
    "apiKeyLabel": "API Key / API 密钥",
    "apiKeyPlaceholder": "请输入 API Key",
    "ollamaKeyPlaceholder": "Ollama 本地模型可留空",
    "capabilityBinding": "能力绑定",
    "capabilityBindingDesc": "当前先作为能力开关保存，后续可接入真实 RAG、记忆、语义缓存和工具服务。",
    "selectedCapabilities": "已选择 {count} 个能力",
    "noneSelected": "暂未选择",
    "chooseCapabilities": "选择能力",
    "cancel": "取消",
    "saveChanges": "保存修改",
    "addToChat": "添加到对话空间",
    "capabilityLibrary": "系统能力库",
    "capabilityLibraryDesc": "RAG、工具调用、记忆、语义缓存建议放在平台能力层，再按 Agent 绑定。",
    "localRagKnowledge": "本地 RAG 知识",
    "localRagDesc": "添加本地知识片段后，绑定 RAG Retrieval 的 Agent 会在每次对话前复用这些内容做轻量检索。",
    "knowledgeTitlePlaceholder": "知识标题，例如：项目定位",
    "knowledgeContentPlaceholder": "粘贴一段项目说明、接口约定、业务规则或参考资料。",
    "addKnowledge": "添加知识",
    "emptyKnowledge": "还没有本地知识片段。添加后，RAG 能力会在聊天运行时检索它们。",
    "deleteKnowledge": "删除知识片段",
    "chooseCapabilityTitle": "选择能力",
    "chooseCapabilityDesc": "选择这个 Agent 可以使用的平台能力。",
    "done": "完成",
    "sequenceTitle": "调用序列图",
    "sequenceDesc": "当前 v0.1 采用顺序多 Agent 调用，先保证稳定可用。",
    "sequenceSteps": ["用户输入", "筛选启用 Agent", "组装上下文", "调用模型", "接收 SSE 事件", "展示消息"],
    "manualAgents": "手动智能体",
    "visibleMessages": "可见消息",
    "currentSpend": "当前消耗",
    "countAgents": "{count} 个",
    "countMessages": "{count} 条",
    "settingsTitle": "基础设置",
    "settingsDesc": "当前版本优先跑通本地 Web MVP。正式生产能力将在下一阶段接入。",
    "apiKeyStorage": "API Key 当前只用于本地手动 Agent 调用，刷新后会保存在浏览器 localStorage。",
    "futureWork": "数据库、账号系统、密钥加密持久化和桌面端打包属于下一阶段。",
    "simulationMode": "未填写 API Key 时，远程模型会进入模拟回复；Ollama 可留空但调用本地服务。",
    "loadedAgents": "已添加的智能体",
}

# Now build the zh block by replacing English values with Chinese
# We need to preserve the exact formatting/structure of the en block
import re

zh_lines = []
for line in en_block_lines:
    # Skip the "  en: {" header, replace with "  zh: {"
    if line.strip() == 'en: {':
        zh_lines.append(line.replace('en: {', 'zh: {'))
        continue
    # Skip closing "  }," 
    if line.strip() == '},':
        zh_lines.append(line)
        continue
    
    # Try to match key-value pairs
    # Match patterns like:   key: "value",
    match = re.match(r'^(\s*)(\w+):\s*(.+),?\s*$', line.rstrip('\n'))
    if match:
        indent = match.group(1)
        key = match.group(2)
        value = match.group(3).rstrip(',')
        
        if key in zh_translations:
            zh_value = zh_translations[key]
            # Check if original used double quotes
            if value.startswith('"') and value.endswith('"'):
                zh_lines.append(f'{indent}{key}: "{zh_value}",\n')
            elif value.startswith('['):
                # Array value
                arr = json.loads(value.replace("'", '"'))
                if key == "sequenceSteps":
                    arr = zh_translations[key]
                zh_lines.append(f'{indent}{key}: {json.dumps(arr, ensure_ascii=False)},\n')
            else:
                zh_lines.append(f'{indent}{key}: {value},\n')
        else:
            zh_lines.append(line)
    else:
        # Lines with nested objects or special formatting
        # Check for nav sub-keys
        nav_match = re.match(r'^(\s*)(\w+):\s*"([^"]*)",?\s*$', line.rstrip('\n'))
        if nav_match:
            indent = nav_match.group(1)
            key = nav_match.group(2)
            if key in zh_translations:
                zh_lines.append(f'{indent}{key}: "{zh_translations[key]}",\n')
            else:
                zh_lines.append(line)
        else:
            zh_lines.append(line)

# Now insert the zh block into the file
# Lines 56-156 (0-indexed: 55-155) need to be replaced
new_lines = lines[:55] + zh_lines + lines[156:]

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('zh block rewritten with correct Chinese')
