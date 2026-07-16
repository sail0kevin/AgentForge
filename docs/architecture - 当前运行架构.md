# AgentForge 当前核心架构
<!-- 文件名：architecture - 当前运行架构 -->

更新时间：2026-07-15 22:04（Asia/Shanghai）

本文只说明当前代码已经运行并经过相应验证的架构。结构化 Planner、交叉评审、ReportArtifact、产品级LangGraph和Checkpoint恢复已经进入当前实现；Provider原生 Tool Calling、共享Checkpointer和真实质量盲评等目标能力见[正式设计](design - 产品设计方案/README - 设计文档总入口.md)，不能从本文推断为已经实现。

## 1. 给普通读者的解释

用户提交一次需求后，服务端会创建一条 Run 记录并取得工作区运行锁，然后按顺序调用 Agent。每个 Agent 可以读取前序输出。消息、失败和费用都关联同一个 runId。模型超时或用户取消时，底层网络请求会停止，后续 Agent 不再启动。最后服务端保存终态并释放锁。

## 2. 当前组件关系

```text
Browser
  → Next.js API Route
      → Auth / user scope
      → Workspace lock + Run persistence
      → 顺序 Agent 循环
          → 单 Agent LangGraph（检索 → 模型）
          → Provider Router
              → Ollama fetch
              → OpenAI-compatible SDK
              → Anthropic SDK
      → Prisma / SQLite
      → SSE events

Browser / API client
  → authenticated /api/plans
      → RequirementAnalysis / clarification
      → ExecutionPlan + server validation
      → PlanningArtifact + Run
```

Route负责认证、校验、依赖装配和 SSE；顺序、预算、失败、终态、消息与费用已经抽取到统一 RunService。

### 2.1 产品级开发报告工作流

```text
/workflows
  → Workflow API + current user scope
  → DevelopmentWorkflow / WorkflowNode
  → Product LangGraph + SQLite Checkpointer
      → create_plan
      → clarification interrupt（需要时）
      → cross_review
      → human_approval interrupt（需要时）
      → generate_report
      → finalize
  → PlanningArtifact → ReviewWorkflow → ReportArtifact
```

baseline和model使用相同图；model节点复用Planner、Review和Report适配器。完整Checkpoint保留在服务端独立数据库，浏览器只读取业务节点和安全标识。详细恢复语义见[Phase 6 Checkpoint专题](remediation - 工程整改实施/phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md)。

## 3. 手动运行主链路

手动运行只接受当前用户拥有的 Agent ID。浏览器不能覆盖数据库中的 system prompt、Provider 或凭证。

执行顺序：

1. 校验用户身份和请求体；
2. 按请求顺序加载当前用户 Agent；
3. 创建 `manual-run-{userId}` 工作区；
4. 使用数据库条件更新取得锁并写入 `activeRunId`；
5. 创建 Run，发送 `run_created`；
6. 保存用户消息；
7. 按顺序运行 Agent；
8. 保存成功/失败消息和 TokenUsage；
9. 完成 Run，按 activeRunId 条件释放锁；
10. 发送唯一 `run_completed`。

## 4. Run 与并发锁

Run 保存一次运行的输入、状态、费用、错误码、开始时间和结束时间。Message 和 TokenUsage 使用可空 runId 关联 Run，以兼容历史数据。

Workspace 保存 `activeRunId`。释放锁时必须同时匹配 workspaceId、userId 和 activeRunId，因此旧请求不能误释放后来运行的锁。

SQLite 在并发写入时可能让第二个请求排队。系统允许两种正确行为：第二个请求明确拒绝，或者两个 Run 串行完成；不允许运行时间重叠和消息交错。

超过30分钟的运行锁可以被视为陈旧锁。新运行取得锁后，旧 Run 标记为 `RUN_LOCK_EXPIRED`。完成统一 Run 超时后，这个固定值应由 RunService 策略管理。

## 5. 单 Agent LangGraph

当前手动运行中的每个 Agent 使用一个线性图：

```text
校验输入
  → retrieveContext
  → invokeAgent
  → 校验 LLMResult
```

图状态只保存调用所需的 Agent 字段、用户输入、前序 Agent 消息、检索上下文和安全模型结果，不保存 API Key、数据库对象或完整 Provider 响应。

这只是单 Agent 执行原型，不是目标设计中的 Planner/Review 产品级工作流。

## 6. 上下文传递

后续 Agent 接收：

- 自己的 system prompt 和能力说明；
- 当前用户需求；
- 需要时检索到的知识；
- 前序 Agent 名称和输出。

前序输出使用真实 Agent 名称归因，避免后续模型只看到内部 ID。当前仍会传递完整前序文本，未来需要按节点提供少量、相关、可追溯上下文。

## 7. 终态规则

整轮运行使用固定优先级：

```text
exhausted > warning > idle
```

- `exhausted`：预算耗尽；
- `warning`：任一 Agent 失败、Provider 超时或运行取消；
- `idle`：正常完成；
- `running`：只允许作为过程状态。

独立 `hadAgentFailure` 防止后续成功覆盖前序失败。

## 8. Provider、超时与取消

Provider Router 支持：

- Ollama 原生 HTTP；
- OpenAI、DeepSeek 和 Custom OpenAI-compatible；
- Anthropic SDK。

单次 Provider 默认超时120秒，最大10分钟。父级 AbortSignal 与 Provider 超时组合后传给实际 fetch/SDK，而不是只在上层停止等待。

稳定错误码：

- `PROVIDER_TIMEOUT`：模型超过时限；
- `RUN_CANCELLED`：客户端或上层取消；
- `CREDENTIAL_NOT_CONFIGURED`：缺少凭证；
- `PROVIDER_AUTH_FAILED`：Provider 拒绝凭证；
- `PROVIDER_UNAVAILABLE`：网络或服务不可达。

超时和取消停止后续 Agent；普通单 Agent Provider 错误仍按当前 MVP 语义记录失败并继续。

## 9. 凭证边界

AgentCredential 是 Agent 专属凭证的优先来源；旧 User ApiKey 只作为迁移兼容回退。

- 数据库存储 AES-256-GCM 密文、IV 和认证标签；
- 凭证仅在服务端调用前解密；
- Agent DTO 只返回 `credentialConfigured` 和 `maskedKey`；
- API Key 不进入浏览器状态、SSE、消息、图状态和报告；
- 远程 Provider 没有 Key 时明确失败，不使用模拟回复伪造成功；
- Ollama 不要求 API Key。

## 10. SSE 事件

手动运行当前事件包括：

- `run_created`
- `user_message_created`
- `agent_started`
- `agent_completed`
- `agent_failed`
- `budget_exhausted`
- `run_completed`
- `error`

手动运行事件携带 runId。`run_created` 带 startedAt，`run_completed` 带 totalSpent、budgetStatus、errorCode 和 finishedAt。

正常运行事件使用 Zod校验的 v1统一契约，全部带 `version: 1`和同一 `runId`。不兼容变更必须提升版本。

## 11. 持久工作区

持久工作区已使用与手动入口相同的 RunService、Prisma Run适配器、activeRunId所有权、LangGraph、RAG能力判断、失败消息、TokenUsage和 AbortSignal。`orchestrator.ts`现在是入口适配器，不再维护第二套顺序/预算/终态状态机。

## 12. RAG

当前数据库文档检索按 userId隔离，使用修正后的轻量 TF-IDF。Markdown在解析时保留标题，Chunk保存 headingPath和真实行号；Document保存 SHA-256、来源类型/URL、版本、许可和审查时间。检索结果返回可追踪 citation。

算法使用保留重复词的对数 TF、正值平滑 IDF和确定性同分排序，解决旧实现的虚假词频和常见有效词零召回。前端能力库、Agent上下文和 Knowledge Tool均使用服务端 Document/Chunk；浏览器旧知识键不再注入模型。

当前固定3查询基线 Recall@1和 MRR为1、无关率为0、引用完整率为1。样本规模仍小，因此不宣称真实项目检索质量已经充分，也暂不据此引入 embedding/pgvector。

## 13. 受控 Tools

Registry幂等注册 `knowledge-search`和 `ui-acceptance-check`两个真实只读 Tool。每个定义具有 Zod输入/输出、权限、超时、每Run次数和输入输出大小。执行入口要求当前用户拥有 Run，并从 PlanningArtifact的 ExecutionPlan读取授权 toolIds。

ToolInvocation以 toolCallId关联 Run和用户，记录 running/completed/failed、错误码和耗时。完成调用可幂等回放；未授权、非法参数、超时、取消、次数和大小超限使用稳定错误码。旧 `USE_TOOL:`自由文本协议和占位 Web Search已经删除。

## 14. 数据库与迁移

当前 SQLite migration：

1. `20260715000000_init`：初始数据模型；
2. `20260715043000_add_runs`：Run、activeRunId、Message/TokenUsage runId。
3. `20260715181000_add_planning_artifacts`：PlanningArtifact与 Run/User/Planner Agent关系。
4. `20260715190000_add_knowledge_sources_and_tool_audit`：知识来源字段与 ToolInvocation。

`db:migrate` 只管理 SQLite。PostgreSQL Schema 可以静态校验，但没有独立 migration history。

## 15. 自动化验证边界

`npm run test:unit` 当前56项：

- 单 Agent LangGraph 6项；
- 终态聚合5项；
- Provider 超时和取消4项。
- 浏览器用户存储隔离4项；
- 文档上传边界和配额4项。
- RunService与 v1事件契约4项。
- Planner契约、动态目录、补充问题、语义校验、有限重试与 Prompt契约6项。
- RAG结构、排序、来源与固定指标6项；
- Tool注册、授权、输入、次数与超时4项。
- Review独立候选、证据、失败、修订、人工门槛和评估8项；
- Report动态目录、来源、partial、敏感内容和知识反伪造5项。

`npm run test:e2e:core` 当前24项：覆盖运行与上传、Workspace-Agent原子绑定、三入口契约、Planner、Review/人工裁决、ReportArtifact版本/幂等/导出、报告中心、baseline/model产品工作流、Checkpoint恢复和受控知识Tool。另有1项 Session A→B→A账号切换 E2E，同时验证文档、PlanningArtifact、Run、Tool、Review、Report和Workflow详情/resume/recover隔离。

E2E 每次创建唯一 SQLite 数据库，应用全部 migration，结束后自动清理，不读取 `prisma/dev.db`，也不调用真实收费 Provider。

生产构建和全量 Lint通过；运行时数据库路径已排除出构建输入，原NFT tracing warning消失。Workspace前端已按控制器、对话、Agent、知识/Tool、看板、设置、文案和共享类型拆分。

## 16. 当前架构边界

已经实现：顺序协作、单 Agent线性图、Run、锁、终态、Provider超时取消、SSE、消息/用量、凭证安全、用户隔离、上传边界、结构化 Planner、PlanningArtifact、版本化文档引用、修正 TF-IDF和受控只读 Tool。

已实现：Planner 后可通过 `/api/reviews` 进入独立 delivery/quality 候选、结构化 Reviewer Finding、动态 Rubric Evaluator、有限修订和人工确认；ReviewWorkflow 关联用户、来源 PlanningArtifact 与独立 Run。

已实现：ReportArtifact不可变版本链、动态章节和Claim来源校验、baseline/model Reporter、生成幂等、Markdown导出和独立报告中心。

已实现：`/workflows`把Planner、双候选、Reviewer、Evaluator、人工确认和Reporter放入同一产品图；clarification/approval支持持久interrupt/resume，异常恢复具有节点幂等键、乐观锁和执行租约。

尚未实现：Provider原生 function calling、共享Checkpointer/多实例恢复、外部真实模型质量盲评和Planner自动执行任意专业任务。
