readme = open('README.md', encoding='utf-8').read()

readme = readme.replace(
    '- Prisma 7 + PostgreSQL 依赖已存在，但当前 v0.1 聊天主流程不依赖数据库',
    '- Prisma 7 + SQLite（通过 libsql 适配器）\n- libsql/client'
)

readme = readme.replace(
    '- 当前 Local RAG MVP 支持手动添加知识片段，并在绑定 RAG Retrieval 的 Agent 调用前注入相关片段。',
    '- 当前 Local RAG MVP 支持手动添加知识片段，并在绑定 RAG Retrieval 的 Agent 调用前注入相关片段。\n- API Key 管理：在系统设置页面添加、查看和删除加密存储的 API Key。'
)

old_boundaries = '## 当前边界\n\n- 当前 Agent、聊天记录和知识片段保存在浏览器 localStorage，不是正式数据库持久化。\n- API Key 当前也保存在本地浏览器，适合本地试用，不适合直接生产上线。\n- PostgreSQL + Prisma 暂不作为聊天主流程硬依赖。\n- 长期记忆、语义缓存和工具调用当前主要是能力契约，尚未接入完整执行链路。\n- 还没有账号系统、团队权限、审计日志、部署监控和桌面端安装包。'

new_boundaries = '## 当前边界\n\n- Agent 配置、聊天记录和知识片段保存在浏览器 localStorage。\n- API Key 现在支持加密存储到 SQLite 数据库（通过系统设置页面管理）。\n- 当前使用 SQLite + Prisma 7（通过 libsql 适配器），可切换到 PostgreSQL。\n- 长期记忆、语义缓存和工具调用当前主要是能力契约，尚未接入完整执行链路。\n- 还没有账号系统、团队权限、审计日志、部署监控和桌面端安装包。'

readme = readme.replace(old_boundaries, new_boundaries)

old_next = '## 下一阶段方向\n\n1. 接入 PostgreSQL + Prisma 持久化 Agent、会话、消息和知识库。\n2. 加密保存 API Key。\n3. 增加文件上传、切分、embedding 和向量检索。\n4. 增加工具调用执行层。\n5. 增加短期记忆和长期记忆。\n6. 增加账号系统、权限和审计日志。\n7. 做桌面端打包或正式 Web 部署。'

new_next = '## 下一阶段方向\n\n1. ~~接入数据库持久化~~ 已完成（SQLite + Prisma 7）。\n2. ~~加密保存 API Key~~ 已完成（AES-256-GCM 加密）。\n3. 消息和 Token 用量持久化到数据库。\n4. 增加文件上传、切分、embedding 和向量检索。\n5. 增加工具调用执行层。\n6. 增加短期记忆和长期记忆。\n7. 增加账号系统、权限和审计日志。\n8. 做桌面端打包或正式 Web 部署。'

readme = readme.replace(old_next, new_next)

api_key_section = '''## API Key 管理

在系统设置页面可以添加和管理不同提供商的 API Key：

1. 进入系统设置页面。
2. 在 "API Key Management" 区域选择提供商。
3. 输入 API Key（至少 8 个字符）。
4. 点击 "Add API Key" 保存。
5. API Key 会经过 AES-256-GCM 加密后存储到数据库。
6. 可以查看已存储的 API Key（脱敏显示）和删除不需要的 Key。

支持的提供商：OpenAI、Anthropic、DeepSeek、Ollama、Custom。

'''

readme = readme.replace('## 当前边界', api_key_section + '## 当前边界')

open('README.md', 'w', encoding='utf-8').write(readme)
print('README.md updated')
