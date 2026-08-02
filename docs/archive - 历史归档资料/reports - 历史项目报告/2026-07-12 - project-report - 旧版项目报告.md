# AgentForge 项目报告
<!-- 文件名：2026-07-12-project-report - 旧版项目报告 -->
<!-- 所属目录：reports - 历史项目报告 -->

## 1. 项目定位

AgentForge 是一个本地优先的双 Agent 协作开发方案生成 Web MVP。它将“需求分析师 → 开发报告负责人”放入同一对话流程：前者拆解用户需求，后者读取前序结论并输出结构化开发方案。

当前目标是交付一个可测试、可演示、可公开展示的 Web 版本，而不是过早扩展为通用自主 Agent 平台。

## 2. 当前协作流程

```text
用户输入需求
  → 需求分析师：目标、范围、限制、风险
  → 开发报告负责人：方案、任务、测试、下一步
  → SSE 实时展示运行状态
  → 保存消息与 TokenUsage
  → 刷新恢复真实历史
```

该流程适合需求分析和开发方案生成：后续 Agent 不只是重复回答，而是基于前序分析继续组织结果。

## 3. 核心架构

```text
用户输入
  → Manual Run API
  → 服务端按顺序加载当前用户的 Agent
  → 读取 Agent 独立模型地址与加密凭证
  → 调用模型并发送 SSE 事件
  → 持久化消息与 TokenUsage
  → 前端实时更新并支持刷新恢复
```

主要技术：Next.js、React、TypeScript、Prisma、SQLite、Zustand、SSE、Playwright。

## 4. 已完成实现

### 顺序协作与失败隔离

- Agent 按用户启用顺序执行；
- 后续 Agent 收到前序 Agent 输出；
- 任一 Agent 失败会保存失败消息并发送 `agent_failed`，不阻断后续队列；
- 前端不在网络错误时伪造成功回复。

### Agent 独立模型与凭证

每个 Agent 可配置 Provider、模型名、API URL 和 API Key。

- API Key 使用 AES-256-GCM 加密保存；
- Agent DTO 只返回 `maskedKey` 与配置状态；
- 原始 Key 不进入浏览器持久状态、SSE、聊天记录或错误提示；
- 支持 Ollama 与 OpenAI-compatible API。

### 会话、用量与知识增强

- 手动运行使用每用户独立 Workspace；
- 用户消息、成功回复和失败回复都可持久化；
- 成功回复与 TokenUsage 事务化保存；
- 刷新恢复历史，清空后旧消息不会复活；
- TF-IDF 从当前用户文档 Chunk 检索相关内容并注入上下文。

## 5. 工程决策

| 决策 | 原因 |
| --- | --- |
| 双 Agent 顺序协作 | 在 MVP 阶段以明确角色分工获得可解释协作，控制成本和状态复杂度。 |
| SSE 而非轮询 | 实时展示多步骤运行状态，前端和服务端实现更轻。 |
| 服务端凭证解密 | 防止 API Key 暴露在浏览器和流式事件中。 |
| TF-IDF 先行 | 不引入 embedding 服务或向量数据库，也能验证检索闭环。 |
| Playwright 核心 E2E | 验证安全、失败和历史等真实链路，不只验证页面渲染。 |

## 6. 演示脚本

1. 使用 Ollama 启动两个默认 Agent；
2. 输入需求，例如“设计大学生 AI 学习助手，并生成开发方案”；
3. 展示需求分析师给出目标、限制和风险；
4. 展示开发报告负责人基于前序结果输出方案、任务、测试和下一步；
5. 展示 Agent 的独立 URL、模型和 API Key 掩码；
6. 刷新页面验证历史恢复，清空后验证旧消息不复活。

完整命令见 [演示指南](../../2026-07-19 - local-demo-guide - 本地演示指南.md)。

## 7. 验证证据

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

## 8. 当前边界

这是可测试、可演示的 Web MVP，尚未定位为生产级公网服务。

- RAG 是 TF-IDF，不是 embedding/pgvector；
- 工具注册和执行 API 已存在，但完整模型 Tool Calling 未闭环；
- Electron shell 已提供，但未做最终安装包验收；
- Provider 超时、取消、生产监控和限流仍待完善；
- 当前没有 LangGraph、动态 Planner、Checkpoint、交叉辩论评审或原生 Tool Calling runtime。

## 9. 后续架构设计

仓库已提供 [LangGraph 工作流、交叉评审、LangChain 组件层和 Web UI/UX 知识工具设计]()。这些内容是下一阶段的设计基线，只有在代码、测试和公开证据完成后，才能作为项目已实现能力描述。

## 10. 简历描述

> AgentForge｜多智能体需求规划与开发方案生成平台。基于 Next.js、TypeScript、Prisma 和 SSE 实现双 Agent 顺序协作，支持前序上下文传递、Agent 独立 API URL/API Key 加密配置、消息持久化、轻量 RAG 与 Playwright 核心 E2E 验收。
