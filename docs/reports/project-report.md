# AgentForge 项目报告

## 1. 项目定位

AgentForge 是一个本地优先的顺序式多智能体协作 Web MVP。它将“需求分析师 → 开发报告负责人”放入同一对话流程：前者拆解需求，后者读取前序结果并生成可执行开发报告。

## 2. 核心架构

```text
用户输入
  → Manual Run API
  → 服务端按顺序加载 Agent
  → 读取 Agent 独立 URL / 加密凭证
  → 调用模型并发送 SSE 事件
  → 保存消息与 TokenUsage
  → 前端实时更新并支持刷新恢复
```

主要技术：Next.js、React、TypeScript、Prisma、SQLite、Zustand、SSE、Playwright。

## 3. 关键实现

### 顺序协作

- Agent 按用户启用顺序执行；
- 后续 Agent 会收到前序 Agent 输出；
- 任一 Agent 失败会发送 `agent_failed`，但不会阻断后续 Agent；
- 适合需求分析、技术方案和开发报告等可分阶段的任务。

### Agent 独立模型连接

每个 Agent 可配置模型 Provider、模型名、API URL 和 API Key。

- API Key 以 AES-256-GCM 加密保存；
- Agent API 仅返回 `maskedKey` 与配置状态；
- 原始 Key 不进入浏览器持久状态、SSE、聊天记录或错误提示；
- 支持 Ollama 与 OpenAI-compatible API。

### 消息与运行持久化

- 手动运行使用每用户独立 Workspace；
- 用户消息、成功回复和失败回复均持久化；
- 成功回复与 TokenUsage 在事务中保存；
- 刷新后恢复历史，清空后旧消息不会复活。

### 轻量 RAG

当前使用 TF-IDF 从当前用户上传文档的 Chunk 中检索相关内容，并注入 Agent 上下文。

选择 TF-IDF 是 MVP 阶段的取舍：无需 embedding 服务或向量数据库，也能验证完整检索链路；后续可升级到 embedding + pgvector。

## 4. 工程决策

| 决策 | 原因 |
| --- | --- |
| 顺序式编排而非并行辩论 | 降低成本和状态复杂度，方便清晰传递前序结论。 |
| SSE 而非轮询 | 实时展示多步骤运行事件，前端实现简单。 |
| 服务端凭证解密 | 避免 API Key 暴露在浏览器和流式事件中。 |
| TF-IDF 先行 | 以最少依赖验证 RAG 产品链路。 |
| Playwright 核心 E2E | 覆盖安全和失败边界，而非只验证页面渲染。 |

## 5. 验证证据

```bash
npm run test:e2e:core
npm run build
```

核心 E2E 覆盖：

- API Key 不出现在 DTO 或 SSE；
- 多 Agent 失败后仍继续；
- 运行只有一个终态；
- 消息历史恢复与清空；
- 主题和语言刷新持久化。

## 6. 演示脚本

1. 用 Ollama 启动两个默认 Agent；
2. 输入一个需求，例如“设计大学生 AI 学习助手”；
3. 展示需求分析师给出目标、限制和风险；
4. 展示开发报告负责人基于前序结果输出方案、任务、测试和下一步；
5. 展示 Agent 的独立 URL/模型/API Key 掩码；
6. 刷新页面验证消息恢复。

## 7. 当前边界与后续方向

这是可测试、可演示的 Web MVP，尚未定位为生产级公网服务。

- RAG 仍是 TF-IDF，未接入向量数据库；
- 工具注册与执行 API 已存在，但完整 Tool Calling runtime 未闭环；
- Electron shell 已提供，但未做最终安装包验收；
- Provider 超时、取消、生产监控和限流仍是后续工作。

## 8. 简历描述

> AgentForge｜多智能体协作开发报告平台。基于 Next.js、TypeScript、Prisma 和 SSE 实现顺序式多 Agent 协作，支持前序上下文传递、Agent 独立 API URL/API Key 加密配置、消息持久化、轻量 RAG 与 Playwright 核心 E2E 验收。
