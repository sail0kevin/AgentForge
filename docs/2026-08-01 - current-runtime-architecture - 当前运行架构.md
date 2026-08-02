# AgentForge 当前核心架构
<!-- 文件名：architecture - 当前运行架构 -->

更新时间：2026-08-01（Asia/Shanghai）

本文说明当前工作区的实现状态与验证边界。结构化 Planner、交叉评审、ReportArtifact、产品级 LangGraph 和 Checkpoint 恢复已经进入当前实现；Provider 原生 Tool Calling、生产队列和真实质量结论等能力见[正式设计](./design - 产品设计方案/旧 - design-index - 设计文档总入口.md)，不能从本文推断为已经实现。

## 当前状态校正（V2）

- **已实现**：SQLite 是默认 Checkpoint 后端；设置 `WORKFLOW_CHECKPOINT_BACKEND=postgres` 可选择 LangGraph `PostgresSaver`。PostgreSQL Prisma schema、独立 migration、跨 Saver crash recovery 测试、分布式 lease 与 fencing token、Docker 专用验收入口和 CI job 均已进入工作区。
- **已验证（WSL 专用临时库）**：三条 PostgreSQL migration、跨 Saver/Graph 恢复、多进程租约领取/续租/竞争接管和旧 token 拒写已通过，测试资源已清理。Docker/CI 回传仍是待补充的独立环境证据；该结果不等于生产负载、队列、exactly-once 或多地域验证，详见 [P0-2 PostgreSQL 验收状态](./2026-08-01 - p0-2-postgres-acceptance-status - P0-2PostgreSQL验收状态.md)。
- **已实现**：RAG 默认使用 TF-IDF；启用 `RAG_EMBEDDINGS_ENABLED=true` 后可持久化 bge-m3 embedding，并在同模型、同维度且完整的语料上使用 RRF 混合检索，否则确定性回退到 TF-IDF。
- **已验证**：12 条确定性 fixture 的 Golden Gate 验证了 TF-IDF 回归；它不是 bge-m3、RRF 或生产知识库的质量结论。真实模型四臂消融执行仍须完成外部成本授权，详见 [V2 Evidence Baseline](./2026-08-01 - v2-evidence-baseline - V2证据基线.md)。

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
  → Product LangGraph + 可切换 SQLite / PostgreSQL Checkpointer
      → create_plan
      → clarification interrupt（需要时）
      → cross_review
      → human_approval interrupt（需要时）
      → generate_report
      → finalize
  → PlanningArtifact → ReviewWorkflow → ReportArtifact
```

baseline和model使用相同图；model节点复用Planner、Review和Report适配器。完整Checkpoint保留在服务端独立数据库，浏览器只读取业务节点和安全标识。详细恢复语义见[Phase 6 Checkpoint专题](./remediation - 工程整改实施/2026-07-15 - phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md)。

### 2.2 扩展场景图（V2）

**已实现（本地确定性基线）：** `src/lib/scenarios/code-review-workflow.ts`
复用 LangGraph 的 `StateGraph` 编排源码快照的静态分析与修复建议生成：

```text
受限源码快照
  → static_analysis（直接文本证据 + 文件/行号）
  → candidate_remediations（最小修改 / 纵深防护）
  → CodeReviewReport
```

这条图刻意独立于 `PlanningArtifact → ReviewWorkflow → ReportArtifact`
主链，避免在尚未定义新的持久化和审批契约前污染需求规划工作流。当前基线只检测少量可由源码文本直接证明的模式；**待实测/目标设计**包括真实仓库接入、AST/SAST、Provider 评审、持久化、UI 以及对真实代码的有效性评估。

**已实现（本地确定性基线）：** `src/lib/scenarios/bug-diagnosis-workflow.ts`
接收受限错误日志和源码上下文，并将路线图要求的诊断阶段显式建模为独立图节点：

```text
错误日志 + 受限源码上下文
  → symptom_analysis
  → root_cause_candidates（仅候选）
  → verification_plan
  → repair_report（仅在验证后实施）
  → BugDiagnosisReport
```

当前只识别日志中可直接匹配的空值属性访问、缺失环境变量和模块解析失败，并输出带验证步骤的候选。它不执行代码、不推断未出现于日志的根因，也不会把匹配结果标注为已证实。**待实测/目标设计**包括真实代码执行与复现、语义根因定位、Provider 诊断、主链持久化、审批/UI 和真实修复效果评估。

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

前序输出使用真实 Agent 名称归因，避免后续模型只看到内部 ID。运行时会按滑动窗口截断 `priorAssistantMessages`，保留最新且可追溯的上下文，避免前序输出无限增长；真实 Provider 下的 token、延迟和费用收益仍待实测。

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

离线质量链路分为两层：

```text
固定夹具（12类检索意图）
  → 无噪声 k=1 / 共享噪声 k=5
  → Recall / MRR / 无关结果率 / 引用完整率

README.md + 当前开发状态.md
  → Markdown 标题与行号切块
  → 6个固定检索意图
  → 检查前5项是否包含目标章节
```

2026-07-19 最终复跑中，固定夹具两种场景的 Recall、MRR 和引用完整率均为 1；共享噪声无关结果率为 `0.5862068965517241`。仓库文档生成 31 个 Chunk，6/6 检索意图命中目标章节。它们是历史 TF-IDF 回归记录，不是通用检索准确率或真实模型语义质量结论。

当前工作区已增加 opt-in embedding 和 RRF 路径：上传文档主事务成功后才尝试写入 embedding；只有检索语料的 embedding 模型、维度和覆盖度一致时才融合，否则继续使用确定性 TF-IDF。12 条满分 fixture 没有区分 RRF 参数的能力，因此在获得多来源人工标注 Golden Set 前，不应表述为“召回率提升”或据此调参。

## 13. 受控 Tools

Registry幂等注册 `knowledge-search`和 `ui-acceptance-check`两个真实只读 Tool。每个定义具有 Zod输入/输出、权限、超时、每Run次数和输入输出大小。执行入口要求当前用户拥有 Run，并从 PlanningArtifact的 ExecutionPlan读取授权 toolIds。

ToolInvocation以 toolCallId关联 Run和用户，记录 running/completed/failed、错误码和耗时。完成调用可幂等回放；未授权、非法参数、超时、取消、次数和大小超限使用稳定错误码。旧 `USE_TOOL:`自由文本协议和占位 Web Search已经删除。

## 14. 数据库与迁移

2026-07-19 的 SQLite migration 历史快照共 9 次：

1. `20260715000000_init`：初始数据模型；
2. `20260715043000_add_runs`：Run、activeRunId、Message/TokenUsage runId；
3. `20260715181000_add_planning_artifacts`：PlanningArtifact与 Run/User/Planner Agent关系；
4. `20260715190000_add_knowledge_sources_and_tool_audit`：知识来源字段与 ToolInvocation；
5. `20260715203000_add_review_workflows`：ReviewWorkflow；
6. `20260715213000_add_report_artifacts`：ReportArtifact版本链；
7. `20260715214500_add_report_generation_idempotency`：报告生成幂等键；
8. `20260715220000_add_development_workflow_checkpoints`：DevelopmentWorkflow、WorkflowNode与节点幂等；
9. `20260716000000_add_api_key_length`：凭证长度元数据。

当前 `db:migrate` 仍管理默认 SQLite schema；后续 SQLite migration 与 V2 schema 变更以 `prisma/migrations/` 为准。PostgreSQL 已有独立 schema 和 migration history，位于 `prisma/postgres/`，并通过 `db:validate:postgres` 静态校验。2026-08-01 已在 WSL 随机专用临时数据库完成迁移应用、`PostgresSaver` crash recovery 与多进程 lease/fencing 验收；Docker/CI 的独立环境复验仍待补充。

## 15. 自动化验证边界

`npm run quality:all` 是当前统一质量门禁，按顺序串联：

1. 12类固定检索夹具评测；
2. README与当前状态文档的6意图仓库检索门禁；
3. 12案例冻结清单与60项运行计划校验；
4. 不调用模型的盲评合成端到端演练；
5. 单元测试、核心E2E与Session隔离E2E；CI 另对 `src/lib/**` 的行、分支、函数覆盖率分别执行 `>=80%` 阻断；
6. TypeScript、ESLint和Production Build。

2026-07-19最终完整运行退出码为 `0`：单元测试72/72、核心E2E 24/24、Session隔离E2E 1/1；仓库文档生成31个Chunk且6/6命中目标章节；TypeScript、ESLint与Build通过。

核心E2E覆盖运行与上传、Workspace-Agent原子绑定、三入口契约、Planner、Review/人工裁决、ReportArtifact版本/幂等/导出、报告中心、baseline/model产品工作流、Checkpoint恢复和受控知识Tool。Session E2E执行A→B→A账号切换，验证文档、PlanningArtifact、Run、Tool、Review、Report和Workflow详情/resume/recover隔离。

E2E每次创建唯一SQLite产品数据库和Checkpoint数据库，应用全部migration，不读取`prisma/dev.db`，也不调用真实收费Provider。Windows清理器包含重试；本次核心E2E测试全部通过且命令成功，但日志仍出现部分临时SQLite文件的EPERM清理提示，因此只能证明清理失败不再误报整个门禁失败，不能声称文件句柄问题在所有Windows环境彻底消失。

## 16. 离线真实模型盲评子系统

盲评属于离线质量链，不参与产品请求的在线运行。其数据流为：

```text
冻结 case-manifest.json（12案例，网站/后台/学习各4个）
  → 校验 Schema、唯一性、类别覆盖与 SHA-256
  → 生成5种变体 × 12案例 = 60项确定性运行计划
  → 收集60份真实模型输出与运行元数据
  → preflight 核对协议、清单哈希和全部 runId
  → prepare 生成匿名 packet.json 与私有 reveal.json
  → 每名评分者生成绑定 packetId / blindId 的独立评分模板
  → 至少2名独立评分者完成全部评分
  → analyze 解盲并按变体汇总评分、修订时间、延迟、Token与费用
```

目前已经完成清单、运行计划、预检、匿名化、评分模板、完整性约束、解盲汇总和合成dry-run。dry-run明确输出 `synthetic: true`、`modelCalled: false`，只证明60项运行和2名合成评分者的工具链可贯通。尚未完成60次真实模型运行与至少2名独立评分者真实评分，因而没有多Agent质量提升、幻觉下降或成本下降结论。

## 17. 当前架构边界

已经实现：顺序协作、单 Agent线性图、Run、锁、终态、Provider超时取消、SSE、消息/用量、凭证安全、用户隔离、上传边界、结构化 Planner、PlanningArtifact、版本化文档引用、修正 TF-IDF和受控只读 Tool。

已实现：Planner 后可通过 `/api/reviews` 进入独立 delivery/quality 候选、结构化 Reviewer Finding、动态 Rubric Evaluator、有限修订和人工确认；ReviewWorkflow 关联用户、来源 PlanningArtifact 与独立 Run。

已实现：ReportArtifact不可变版本链、动态章节和Claim来源校验、baseline/model Reporter、生成幂等、Markdown导出和独立报告中心。

已实现：`/workflows`把Planner、双候选、Reviewer、Evaluator、人工确认和Reporter放入同一产品图；clarification/approval支持持久interrupt/resume，异常恢复具有节点幂等键、乐观锁和执行租约。

尚未实现或待实测：Provider 原生 function calling、生产队列、真实模型四臂消融与人工盲评、Planner 自动执行任意专业任务；PostgreSQL Checkpointer 与多实例 lease/fencing 已实现但尚未完成专用数据库运行时验收。
