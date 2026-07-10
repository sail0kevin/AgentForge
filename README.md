# Multi-Agent Workspace (多 Agent 工作平台)

## 当前版本：v0.1 稳定版（本地 MVP）

一个允许用户手动配置多个 AI Agent（支持 Ollama、OpenAI、DeepSeek、Anthropic 等），
并在同一对话区进行多 Agent 顺序协作的本地 Web 工作台应用。

> ⚠️ 当前版本定位为**本地可演示的 MVP**，尚未达到生产级 SaaS 上线标准。
> 数据库持久化、账号系统、API Key 加密存储、桌面端打包将在下一阶段接入。

---

## 功能概览

| 页面 | 说明 |
|------|------|
| 💬 对话空间 | 添加多个 Agent，发送消息后已启用的 Agent 依次回复 |
| 🤖 创建智能体 | 手动配置 Agent（模型来源、API URL、API Key、模型名称、能力绑定） |
| 📦 能力库 | 管理系统级能力开关（RAG、工具调用、记忆、语义缓存）和本地知识片段 |
| 📊 调用链路 | 展示当前多 Agent 顺序调用的流程图 |
| ⚙️ 基础设置 | 系统预留配置页 |

---

## 快速开始

### 前置要求

- Node.js 18+
- npm 或 pnpm
-（可选）本地 Ollama 服务，用于调用本地模型

### 安装与启动

`ash
npm install
npm run dev
# 打开 http://localhost:3000
`

### 使用流程

1. 点击左侧「创建智能体」
2. 选择模型来源（如 Ollama / OpenAI Compatible / DeepSeek）
3. 填写 API URL、API Key、模型名称
4. 编写角色设定 Prompt（至少 10 个字符）
5. 可选：绑定能力（RAG、工具调用、记忆等）
6. 点击「添加到对话空间」
7. 切换到「对话空间」，在底部输入框发送消息
8. 已启用的 Agent 会依次回复

### 使用本地 Ollama

1. 确保 Ollama 服务已启动（默认 http://localhost:11434）
2. 创建 Agent 时选择「Ollama」，API Key 留空即可
3. 模型名称填写本机已下载的模型名，如 llama3.1、qwen2.5

### 使用远程 API（OpenAI / DeepSeek 等）

1. 创建 Agent 时选择对应的模型来源
2. 填写你的 API Key
3. 模型名称填写服务商支持的模型 ID，如 gpt-4o-mini、deepseek-chat

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 |
| 状态管理 | Zustand |
| UI 组件 | Lucide Icons |
| 后端 | Next.js API Routes |
| 模型调用 | OpenAI SDK + Anthropic SDK + 原生 fetch (Ollama) |
| 数据库 | Prisma 7 + SQLite（预留，当前主要用 localStorage） |
| 流式通信 | SSE (Server-Sent Events) |

---

## 项目结构

`
src/
+--- app/                    # Next.js App Router
|   +--- api/               # API 路由
|   |   +--- agents/        # Agent CRUD
|   |   +--- documents/     # 文档管理
|   |   +--- workspaces/    # 工作空间 & 对话运行
|   +--- layout.tsx         # 全局布局
|   +--- page.tsx           # 首页
+--- components/workspace/   # 页面组件
|   +--- workspace-app.tsx  # 主应用组件
+--- lib/
|   +--- llm/               # LLM 调用路由器
|   |   +--- router.ts
|   +--- capabilities/      # 能力注册
|   +--- rag/               # RAG 检索（预留）
|   +--- validation.ts      # 请求校验
+--- store/
    +--- workspace-store.ts  # 全局状态管理
`

---

## 能力层设计

v0.1 版本将 RAG、工具调用、记忆、语义缓存作为**平台能力层**的合约字段保存。
每个 Agent 可以绑定一组能力，但实际执行逻辑在后续版本接入。

设计原则：
- **能力是平台级共享资源**，不是每个 Agent 独立实现一份
- Agent 通过能力 ID 绑定到平台能力
- 未来新增能力不需要修改 Agent 配置

---

## 后续规划

| 阶段 | 内容 |
|------|------|
| v0.2 | 接入真实 RAG 向量检索、长期记忆存储 |
| v0.3 | 工具调用执行、语义缓存 |
| v0.4 | PostgreSQL + Prisma 持久化、账号系统 |
| v0.5 | 桌面端打包 (Electron/Tauri) |
| v1.0 | 生产级 SaaS 上线 |

---

## 开发规范

- 所有代码注释使用中文
- 每个文件顶部有文件级注释（作用 + 原理 + 如何调用）
- 每个函数/类有注释块（作用 + 原理 + 参数与返回值 + 如何调用）
- 复杂逻辑有行内注释说明为什么

---

## License

MIT
