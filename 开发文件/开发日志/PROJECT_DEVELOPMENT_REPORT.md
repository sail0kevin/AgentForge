# Multi-Agent Workspace v0.1 开发报告

## 1. 项目定位

Multi-Agent Workspace 是一个本地优先的多 Agent 对话工作台。当前 v0.1 版本先解决最小可用闭环：用户手动创建 Agent，填写 API URL、API Key、模型名称和 Prompt，然后在同一个聊天区输入消息，让启用的 Agent 按顺序回复。

本项目当前可以作为本地演示版和学习版交给别人试用，但还不是正式生产级 SaaS。生产上线需要继续补齐账号系统、数据库持久化、API Key 加密存储、权限控制、部署监控和安全审计。

## 2. 当前完成状态

已经完成：

- Next.js 16 + React 19 + TypeScript 项目基础结构。
- 白色 / 浅灰 SaaS 风格工作台界面。
- 左侧全局导航和右侧动态内容区。
- 手动创建 Agent，不再默认加载演示 Agent。
- Agent 字段支持名称、Prompt、模型来源、API URL、API Key、模型名称和能力绑定。
- 对话空间输入框始终可见。
- 用户发送消息后，用户消息立即显示。
- 支持多个启用 Agent 在同一个聊天区依次回复。
- 单个 Agent 模型调用失败时，显示失败消息，并继续处理其他 Agent。
- Ollama 本地模型调用，API Key 可留空。
- OpenAI-compatible、DeepSeek、Anthropic 模型路由基础能力。
- Agent 配置和最近聊天记录使用 localStorage 保存。
- 能力库预留 RAG、工具调用、长期记忆、语义缓存等开关。
- 调用链路页面展示当前多 Agent 调用序列。
- README 和开发报告已按当前状态更新。
- SQLite + Prisma 7 数据库持久化（通过 libsql 适配器）。
- API Key 加密存储（AES-256-GCM）。
- 消息和 Token 用量在数据库可用时自动持久化。

尚未完成：

- 正式用户登录和多用户隔离。
- 生产级 RAG 检索链路（文件上传、切分、embedding、向量检索）。
- 真实工具调用执行层。
- 长期记忆和语义缓存执行逻辑。
- 生产部署、监控、日志审计和桌面端打包。

## 3. 当前架构

```text
Browser UI
  |
  | localStorage 保存 Agent 和最近消息
  |
  | POST /api/workspaces/manual/run
  v
Next.js Route Handler
  |
  | SSE events
  v
LLM Router
  |-- Ollama local /api/chat
  |-- OpenAI-compatible client
  |-- DeepSeek compatible endpoint
  |-- Anthropic SDK
```

当前 v0.1 关键原则：聊天主流程不依赖数据库。这样即使 PostgreSQL 没启动，用户仍然可以本地创建 Agent 并测试对话。

## 4. 核心模块说明

- `src/components/workspace/workspace-app.tsx`：主工作台界面，包含导航、Agent 创建、聊天空间、能力库和调用链路。
- `src/app/api/workspaces/manual/run/route.ts`：当前 MVP 的手动多 Agent 运行接口，返回 SSE 事件流。
- `src/lib/llm/router.ts`：模型调用路由，负责 Ollama、OpenAI-compatible、DeepSeek 和 Anthropic 的调用分发。
- `src/lib/validation.ts`：接口入参校验，防止非法 payload 进入运行链路。
- `src/store/workspace-store.ts`：前端消息流和运行状态管理。
- `prisma/schema.prisma`：后续数据库持久化基础模型，目前不作为 v0.1 聊天主流程硬依赖。

## 5. 使用方式

启动项目：

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:3000
```

创建 Ollama Agent：

```text
模型来源：Ollama
API URL：http://localhost:11434
API Key：留空
模型名称：填写本机已安装模型，例如 llama3.1
```

创建远程 API Agent：

```text
模型来源：OpenAI Compatible / DeepSeek / Anthropic / Custom
API URL：模型供应商地址
API Key：你的模型密钥
模型名称：供应商支持的模型名
```

## 6. 验收标准

v0.1 必须满足：

- 未创建 Agent 时，输入框仍然可见。
- 未创建 Agent 时发送消息，用户消息会显示，并提示需要启用 Agent。
- 创建 Ollama Agent 后，可以使用本地模型回复。
- 创建远程 API Agent 后，可以使用 API Key 调用模型回复。
- 同时启用多个 Agent 后，它们会按顺序回复。
- 禁用 Agent 后，该 Agent 不参与回复。
- API URL 错误或模型服务未启动时，聊天区显示清晰失败消息。
- 刷新页面后，本地 Agent 配置仍然存在。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 通过。

## 7. 下一阶段计划

下一阶段建议按以下顺序推进：

1. ~~接入数据库持久化~~ 已完成（SQLite + Prisma 7，通过 libsql 适配器）。
2. ~~加密保存 API Key~~ 已完成（AES-256-GCM 加密，通过系统设置页面管理）。
3. ~~消息和 Token 用量持久化到数据库~~ 已完成（manual/run 接口在数据库可用时自动保存消息和 Token 用量）。
4. 增加文件上传、切分、embedding 和向量检索（生产级 RAG）。
5. 增加工具调用执行层。
6. 增加短期记忆和长期记忆。
7. 增加账号系统、权限和审计日志。
8. 做桌面端打包或正式 Web 部署。

RAG、工具、记忆和语义缓存建议放在平台能力层，不要直接硬塞进每个 Agent。Agent 只声明自己允许使用哪些能力，由运行时统一调度。

## 8. Capability Registry 当前实现

当前版本已经新增 `src/lib/capabilities/registry.ts`，把 RAG 检索、长期记忆、语义缓存、工具调用、文件读取、代码审查注册为统一的平台能力。Agent 配置中新增 `capabilityIds` 字段，用来保存该 Agent 允许使用的能力列表；旧的 `tools` 字段继续保留为本地配置兼容字段。

手动运行接口 `src/app/api/workspaces/manual/run/route.ts` 已经接收前端传入的 `capabilityIds`，并在构建模型上下文时把能力说明注入到 Agent 的 system prompt 后面。当前这一步是能力契约和运行时上下文注入，不是真实执行 RAG、记忆写入、语义缓存或工具调用。

后续企业化方向应保持三层拆分：Agent 负责身份、Prompt、模型和能力权限；Capability Layer 负责 RAG、Memory、Tool、Cache 等可复用能力；Runtime/Orchestrator 负责决定何时调用能力、如何注入上下文、如何记录结果。

## 9. Local RAG MVP 当前实现

本阶段已经实现一个轻量本地 RAG MVP，用来验证“RAG 作为平台能力被 Agent 复用”的产品和架构链路。

已完成内容：
- 新增 `KnowledgeSnippet` 类型，用来描述本地知识片段。
- 新增 `src/lib/capabilities/rag.ts`，提供关键词检索和上下文格式化能力。
- 能力库页面新增 `Local RAG Knowledge` 管理区，可以添加、查看、删除本地知识片段。
- 本地知识片段保存在浏览器 `localStorage`，不依赖 PostgreSQL。
- `manual/run` 接口接收 `knowledgeSnippets`，并在 Agent 绑定 `rag` 能力时检索相关片段。
- 命中的知识片段会被注入到该 Agent 的 system context 中，供模型回答时参考。

当前边界：
- 这是轻量关键词检索，不是生产级向量 RAG。
- 尚未实现文件上传、文档切分、embedding、向量索引、重排、引用来源展示和权限隔离。
- 该实现的价值是打通能力复用链路：RAG 属于 Capability Layer，Agent 只通过 `capabilityIds` 声明是否允许使用。
