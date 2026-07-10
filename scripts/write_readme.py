import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

readme = '''# Multi-Agent Workspace

Multi-Agent Workspace 是一个本地的多 Agent 对话工作平台。当前 v0.1 的核心目标很明确：用户手动创建 Agent，填写模型连接信息，然后在同一对话区里让一个或多个 Agent 依次回复。

当前版本是本地 MVP，可以交给别人本地试用，但还不是正式 SaaS 上线版本。数据库账号系统、API Key 加密持久化、正式 RAG、工具调用、长期记忆和桌面端打包会放到后续阶段。

## 当前能力

- 手动创建 Agent，不加载默认演示 Agent
- 支持编辑、删除、启用和停用已经创建的 Agent
- 支持 Ollama 本地模型，API Key 可以留空
- 支持 OpenAI Compatible、DeepSeek、Anthropic、Custom 模型来源
- 聊天输入框始终可用
- 用户发送消息后，用户消息气泡会立即显示
- 没有启用 Agent 时，用户消息仍然保留，并提示需要添加或启用 Agent
- 启用多个 Agent 时，它们会按列表顺序依次回复
- 单个 Agent 调用失败时，会显示该 Agent 的失败消息，不中断其他 Agent
- Agent 配置、最近聊天记录、本地 RAG 知识片段和语言偏好保存在浏览器 localStorage
- 提供 中文 / English 界面切换
- 能力库已经抽象出 RAG、长期记忆、语义缓存、工具调用、文件读取、代码检查等能力契约
- 当前 Local RAG MVP 支持手动添加知识片段，并在绑定 RAG Retrieval 的 Agent 调用前注入相关片段
- API Key 管理：在系统设置页面添加、查看和删除加密存储的 API Key

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Zustand
- OpenAI SDK
- Anthropic SDK
- Prisma 7 + SQLite（通过 libsql 适配器）
- libsql/client

## 本地启动

安装依赖：

```bash
npm install
```

初始化数据库：

```bash
npx prisma generate
```

启动开发服务器：

```bash
npm run dev
```

打开浏览器访问 `http://localhost:3000`。

## 使用流程

1. 进入 **创建智能体** 页面，填写智能体名称、角色设定 Prompt、模型来源、API URL、API Key 和模型名称
2. 点击 **添加到对话空间**
3. 进入 **对话空间** 页面，输入消息并发送
4. 已启用的 Agent 会依次回复

## Ollama 本地使用

1. 在本地安装并启动 Ollama
2. 拉取一个模型：`ollama pull llama3.1`
3. 创建 Agent 时选择模型来源为 `Ollama`，API Key 留空，模型名称填写 `llama3.1`
4. 发送消息即可与本地模型对话

## 远程 API 使用

1. 创建 Agent 时选择对应的模型来源（OpenAI Compatible / DeepSeek / Anthropic）
2. 填写 API URL、API Key 和模型名称
3. 发送消息即可通过远程 API 对话

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   │   ├── agents/         # Agent CRUD
│   │   ├── api-keys/       # API Key 管理
│   │   ├── documents/      # 文档上传与检索
│   │   └── workspaces/     # 工作区运行
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 主页
├── components/workspace/    # 工作区组件
│   └── workspace-app.tsx   # 主应用组件
├── lib/                    # 核心库
│   ├── capabilities/       # 能力注册
│   ├── engine/             # 编排引擎
│   ├── llm/                # LLM 路由
│   ├── rag/                # RAG 模块
│   ├── security/           # 加密
│   ├── billing.ts          # 计费
│   ├── db.ts               # 数据库
│   ├── types.ts            # 类型定义
│   ├── validation.ts       # 校验
│   └── ...
└── store/                  # Zustand 状态管理
    └── workspace-store.ts
```

## 后续计划

- PostgreSQL + Prisma 作为正式存储
- RAG 向量检索
- 工具调用执行
- 长期记忆系统
- 语义缓存
- 桌面端打包（Electron）
- 账号系统和多租户
'''

with open('README.md', 'w', encoding='utf-8') as f:
    f.write(readme)

print('README rewritten cleanly')
