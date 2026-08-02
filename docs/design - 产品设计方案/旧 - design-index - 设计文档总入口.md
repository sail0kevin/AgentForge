# AgentForge 设计文档
<!-- 文件名：README - 设计文档总入口 -->
<!-- 所属目录：design - 产品设计方案 -->

本目录记录 AgentForge 从当前可测试 Web MVP 演进为多智能体需求规划与开发方案生成平台的设计。

## 状态标记

- **已实现**：已进入当前代码并通过相应验证。
- **原型**：已有局部代码或数据结构，但未形成主运行链路能力。
- **目标设计**：后续实现方案，不可写成当前已完成能力。

## 当前能力与目标能力

| 能力 | 当前状态 | 说明 |
|---|---|---|
| 顺序多 Agent 协作 | 已实现 | 后续 Agent 可读取前序输出。 |
| SSE 运行事件 | 已实现 | 推送 Agent 开始、完成、失败和结束。 |
| API Key 安全管理 | 已实现 | 服务端加密、DTO 掩码、前端不保存明文。 |
| 结构化 Planner与动态目录 | 已实现 | Zod契约、服务端校验、有限重试和 PlanningArtifact。 |
| 版本化 TF-IDF文档检索 | 已实现 | 标题/行号/来源 citation、固定评测和用户隔离。 |
| 受控只读 Tool | 已实现 | Planner授权、Zod、超时/次数/大小、toolCallId和审计。 |
| LangGraph 单 Agent 线性图 | 已实现 | 手动运行中用于“检索上下文 → 调用模型”。 |
| LangChain 组件层 | 目标设计 | 统一 Prompt、模型、结构化输出、Retriever 与 Tools。 |
| LangGraph 产品状态工作流 | 已实现 | Planner、补充信息、评审、人工裁决、Reporter、Checkpoint和故障恢复已进入`/workflows`。 |
| 交叉评审与有限修订 | 工程已实现 | 独立候选、Finding、Evaluator、人工裁决、ReviewWorkflow、Reporter/UI已完成；外部真实质量盲评待完成。 |
| ReportArtifact与动态报告 | 已实现 | 动态章节、Claim来源、状态、版本、幂等、Markdown导出和独立报告中心。 |
| Web UI/UX 知识工具 | 部分实现 | `ui-acceptance-check`基线已实现；完整专业规则集仍待扩充。 |

## 阅读顺序

1. [LangGraph 工作流架构](./旧 - langgraph-workflow-architecture - LangGraph工作流架构.md)
2. [多 Agent 交叉评审工作流](./旧 - multi-agent-cross-review-workflow - 多智能体交叉评审工作流.md)
3. [LangChain 集成设计](./旧 - langchain-integration-design - LangChain集成设计.md)
4. [Web UI/UX 知识工具设计](./旧 - web-ui-ux-knowledge-tool-design - Web界面知识工具设计.md)
5. [来源与许可说明](./2026-07-12 - design-references-and-license - 设计参考与许可说明.md)

## 现有代码映射

| 当前代码 | 未来职责 |
|---|---|
| `src/lib/engine/run-service.ts` | 当前唯一顺序业务状态机。 |
| `src/lib/planner/` | 当前需求分析、计划、校验和持久化。 |
| `src/lib/llm/router.ts` | ProviderAdapter / ModelFactory 迁移起点。 |
| `src/lib/llm/tool-runner.ts` | 工作流提供结构化 ToolCall的纯组合适配器。 |
| `src/lib/tools/` | 当前受控 Tool Registry、真实工具和审计服务。 |
| `src/lib/rag/retrieval.ts` | 当前修正后的 TF-IDF Retriever adapter。 |
| `src/lib/review/` | 当前候选、Reviewer、Evaluator、有限修订、模型适配、评估和持久化。 |
| `src/app/api/reviews/` | 当前 Review创建/查询与人工裁决 API。 |
| `src/lib/report/` | 当前动态报告契约、baseline/model Reporter、来源校验、版本持久化和导出。 |
| `src/app/api/reports/` | 当前Report列表/生成、详情和Markdown导出API。 |
| `src/lib/workflow/` | 当前产品LangGraph、Checkpoint、baseline/model适配、幂等和恢复。 |
| `src/app/api/workflows/` | 当前Workflow列表/创建、详情、resume和recover API。 |
| `src/app/api/workspaces/manual/run/route.ts` | SSE、持久化和手动运行基准。 |
| `src/store/workspace-store.ts` | 统一消费未来 node/tool/review/approval 事件。 |
| `prisma/schema.prisma` | 已有 Run、PlanningArtifact、ToolInvocation、ReviewWorkflow、ReportArtifact、DevelopmentWorkflow和WorkflowNode；完整Checkpoint存放在独立数据库。 |

> 简历、面试稿和个人表达保存在本机 `local-only/`，该目录被 Git 忽略，不属于公开文档。
