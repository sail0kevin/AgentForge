# AgentForge 项目记忆
<!-- 文件名：project-memory - 项目长期记忆 -->

最后更新：2026-07-16（Asia/Shanghai）

本文件保存跨阶段仍应记住的稳定事实、已确认决策和当前优先级。详细证据与历史问题见带日期的评审文档；不要在这里复制完整评审。

## 稳定产品边界

- 长期产品是面向 Web 项目的多智能体需求规划与开发方案生成平台。
- 核心产物是根据需求动态生成的开发方案报告，不是固定章节模板，也不是普通多 Agent 聊天记录。
- 目标工作流是“需求分析 → Planner 与计划校验 → 本地知识工具 → 候选方案 → 交叉评审 → Evaluator/人工确认 → 动态报告”。
- 当前双 Agent“需求分析师 → 开发报告负责人”只是第一阶段可测试 MVP，不应写成长期产品上限。
- 自动编写完整代码、自动部署、无限自主执行和无限评审不属于目标边界。

## 当前代码事实

- 手动、持久和 Demo三条入口都使用统一 `runService`；每个真实 Agent通过 `runSingleAgentGraph`执行“检索上下文 → 调用模型”的线性图。
- `/api/plans` 已实现结构化需求分析、关键缺失信息追问、计划生成和动态目录；不传 Agent时走确定性基线，传入当前用户的 Planner Agent时走真实模型。
- Planner计划必须通过 Zod、Agent/Tool白名单、依赖 DAG、任务/轮次/Token/费用预算和章节引用校验；默认最多两次结构化重试。
- PlanningArtifact保存 ready、needs_clarification或 failed，并以唯一 runId和 userId关联；Session A/B规划记录隔离已有 E2E证据。
- `/api/reviews` 已实现确定性 baseline 和真实模型两种模式；delivery/quality 候选在生成时只接收 orientation、analysis 和 plan，不接收对方候选。
- Candidate、Finding、Review、Rubric、Evaluation 和人工裁决均使用 Zod/JSON Schema；Evaluator 的声明还会经过服务端引用、证据和高影响冲突门槛复核。
- 单候选、Reviewer、Evaluator 或修订失败会保存 `partial` 和失败码；两个候选都失败保存 `inconclusive`，不会生成虚假成功结果。
- P2-4 已具备离线盲评工具链：五种预定义变体的匿名材料包与私有解盲表分离，拒绝变体缺失、重复运行/评分者和漏评；最低门槛为12案例、2名独立评分者。它只验证实验流程，真实模型与人工评分数据仍未收集。
- ReviewWorkflow 关联当前用户、来源 PlanningArtifact 和独立 Run；高影响冲突进入 `needs_human`，裁决选择、备注与时间持久化，相同重试幂等且不同裁决不可覆盖。
- Review 模型模式受每角色最多2次结构化尝试、0～2轮修订、总 Token/费用、统一 Provider 超时和 AbortSignal 约束；baseline/model 由 API 明确标注。
- `/api/reports` 已实现 baseline和真实 Reporter两种模式；DevelopmentReport必须沿用 Planner动态目录，并把事实、假设、建议、风险、取舍和未决项写成带来源的 Claim。
- ReportArtifact按 PlanningArtifact、ReviewWorkflow、Run和 userId持久化；每次明确生成新版本并连接 parentReportId，相同 generationKey重试只回放原版本。
- 知识引用只允许来自来源计划 Run中成功且已审计的 knowledge-search输出；模型发明的 knowledge ref不能通过服务端校验。
- `/reports`是独立报告中心，展示版本、状态、动态目录、最终决策、风险、未决项和来源；Markdown导出会重新加载来源链并复验。
- `/workflows`是独立产品工作流页；产品LangGraph包含create_plan、clarification、cross_review、human_approval、generate_report和finalize等业务节点，baseline/model共用同一图。
- model工作流要求Planner、双候选、Reviewer、Evaluator和Reporter角色；所有Agent归属当前用户，并沿用原Planner/Review/Report预算、结构化输出和TokenUsage适配。
- DevelopmentWorkflow和WorkflowNode保存产品查询状态；完整图状态保存在独立SQLite Checkpoint数据库。API只返回Checkpoint ID和空namespace，不返回channel_values或versions_seen。
- clarification与approval使用interrupt/resume；计划轮次、Review、人工裁决和Report均有持久幂等键，相同resume回放当前结果，不同resume返回冲突。
- failed或租约过期的running工作流可通过recover认领并从同一thread继续；30分钟租约和乐观version适用于当前单实例Web MVP，多实例仍需共享checkpointer与心跳。
- Planner、Review和Reporter的模型结果即使被结构化校验拒绝，也会在能够取得Provider用量时保存失败消息与TokenUsage；已持久化节点可幂等回放。
- Provider已经计费但响应或Artifact尚未落库时发生进程崩溃，仍存在结果未知窗口；严格费用exactly-once需要Provider幂等键或持久ModelCall账本，不能只靠Checkpoint宣称解决。
- Workspace创建会验证所有agentIds属于当前用户、拒绝重复ID，并按提交顺序在一次事务性嵌套写入中创建关联；失败不留下空Workspace。
- 主聊天页已使用持久任务对话空间，而不是内部 `manual-run-*` 兼容空间。用户可创建/编辑任务名称、说明和成员；“开发报告生成”默认绑定需求分析师与开发报告负责人，消息、Run、费用和锁均按空间隔离。清空消息不删除空间或成员。
- Workspace前端按控制器、文案、共享类型、导航、对话、Agent、知识/Tool、看板和设置拆分；主控制器由约1550行降至约458行。
- 服务端 Document/Chunk是唯一运行时产品知识源；浏览器旧知识键只清理，不再注入模型。
- Markdown Chunk保存 headingPath和真实行号；Document保存 SHA-256、来源、版本、许可和审查时间；检索结果带 citation。
- TF-IDF使用保留重复词的对数 TF、正值平滑 IDF和确定性排序；当前3查询固定基线 Recall@1=1、MRR=1、无关率0、引用完整率1，但样本仍小。
- 当前真实只读 Tool为 `knowledge-search`和 `ui-acceptance-check`；调用需当前用户拥有 Run、计划授权、Zod输入输出、次数/大小/超时限制，并写 ToolInvocation审计。
- 能力库中的文档是当前账号的共享知识源；只有 Agent 绑定 `rag` 能力时，持久空间运行才检索资料。`tool-call` 目前是受控计划/工作流工具能力，不会让普通聊天自动调用任意工具。
- v1运行事件均有 version、runId和运行期字段；持久/手动使用 Prisma Run适配器，Demo使用内存适配器。
- API Key 在服务端以 AES-256-GCM 保存；Agent DTO 只返回掩码、配置状态和长度。API Key管理页会同时列出全局供应商密钥和智能体专属密钥，并以“已加密保存 · 掩码”确认保存；智能体编辑表单会按原 Key 的字符数显示保密圆点，点击后才进入替换输入。绝不把明文、密文、IV或认证标签返回浏览器。
- 文档数据库检索按 userId 限定；浏览器过渡知识也已按 userId 命名空间隔离。旧 v1 无归属知识/消息只删除、不自动分配给登录用户。
- Tool Registry 已由 `/api/tools` 和 `/api/tools/execute` 使用，当前只开放有真实实现并受计划授权的只读工具。
- 0.1正式交付形态已经确定为Web MVP；Electron是实验壳，不是当前可交付产品，重新启动桌面阶段前必须完成数据目录、migration、端口、进程和干净机器安装验收。
- `.env` 已停止 Git 跟踪且本机文件保留；`security:verify-secrets` 可检查未跟踪、常见泄露特征与运行时密钥就绪而不回显值；历史密钥轮换仍需项目所有者确认。
- SQLite 已有9次标准迁移，核心 E2E 使用唯一临时产品数据库和Checkpoint数据库并在结束后清理。旧初始版dev.db已通过精确结构识别、自动备份、baseline和deploy安全升级。
- PostgreSQL 当前只保留 schema 静态校验，没有独立 migration history。
- 手动运行和持久工作区已经使用统一终态聚合规则：`exhausted > warning > idle`；任一 Agent 失败会保留整轮 `warning`。
- 手动运行已有 Run 实体、Workspace.activeRunId 服务端锁、消息/用量 runId 关联和锁所有权释放；SQLite 并发请求可能排队，但运行区间不会重叠。
- 三类 Provider 均接受真实 AbortSignal；默认单次调用超时120秒。SSE 取消和 Provider 超时会停止后续 Agent，并以 RUN_CANCELLED/PROVIDER_TIMEOUT 记录。
- 登出/账号切换会清空 Workspace 与 Agent Zustand Store，并中止历史和运行请求；过期 Agent 响应通过 generation 丢弃。
- 文档上传在读取内容前检查 file.size，按 UTF-8 字节保存 size；单文件5 MiB、单用户100份/50 MiB/20,000 Chunk、单文档2,000 Chunk，Document/Chunk 事务写入失败全回滚。
- 当前工作区包含大量未提交改动；评审结论针对工作区状态，而不是 Git HEAD。

## 当前最高优先级

1. 由项目所有者确认历史真实密钥和 Secrets 已完成轮换。
2. Phase 1～4已完成；Phase 5工程闭环完成，盲评工具链已完成，真实模型 + RAG + 人工盲评数据收集仍为部分完成。
3. Phase 6已完成3/3：ReportArtifact、动态报告、独立报告中心、产品级工作流页、Checkpoint暂停/恢复和异常恢复均已闭环。
4. 按盲评协议冻结12个以上案例、运行五种变体、完成独立评分和解盲汇总，比较单 Agent、双 Agent、RAG和评审价值，补齐 P2-4。
5. Phase 7已完成：前端拆分、Workspace-Agent绑定、全量Lint/Build和Web/Electron发布边界已收口。
6. 决定是否启动共享Checkpointer/多实例恢复、PDF/DOCX和WCAG人工审计的后续阶段；不得把未验收Electron壳写成完成产品。

## 已确认的文档决策

- `docs/current-status - 当前开发状态.md` 作为当前实现状态的唯一事实源。
- `docs/design/` 只保存目标设计或原型，必须显式标记状态。
- `docs/reviews/` 保存带日期的评审快照，不覆盖旧评审。
- `docs/archive/` 保存被新设计或新路线明确取代的报告；归档内容不作为当前实施依据。
- 本文件只记录稳定事实和当前优先级；问题解决后更新状态，不保留冗长过程。
- 当前不移动 `architecture - 当前运行架构.md`、`current-status - 当前开发状态.md`、`demo - 本地演示指南.md`，先通过 `docs/README - 文档索引.md` 统一入口。
- `docs/remediation/final-report - 工程整改与开发总报告.md` 是答辩和交接用完整主报告，必须始终反映当前完整事实，不能保留空白占位。

## 最近一次评审

- [AI 接手交接文档（2026-07-16）](ai-handover-2026-07-16 - AI接手交接说明.md)：面向不了解历史的新 AI，说明当前架构、最近变更、约束和推荐接手顺序。
- [2026-07-15 代码与文档评审](reviews - 历史评审复查/2026-07-15-code-and-documentation-review - 代码与文档评审.md)
- [2026-07-15 设计对齐复查](reviews - 历史评审复查/2026-07-15-design-alignment-review - 设计对齐复查.md)
- [整改执行总览](remediation - 工程整改实施/README - 整改执行总览.md)
- 验证摘要：单元测试62/62（含盲评匿名化、解盲汇总与命令行全流程）；隔离数据库核心 E2E 24/24、Session A→B→A E2E 1/1；九次 SQLite migration可从空库应用，旧初始库可备份升级；两份 Prisma schema、生产构建和全量 lint通过；原NFT tracing warning已消除。

## 更新规则

每完成一个阶段时：

1. 更新 `current-status - 当前开发状态.md` 的完成项、限制、日期和验证证据；
2. 更新本文件的“当前代码事实”和“当前最高优先级”；
3. 不直接删除历史评审，只在新的评审中记录复查结果；
4. 只有通过对应测试后，才能把目标设计改成已实现。
5. 后续代码整改的详细过程写入 `remediation/phase-*.md`，本文件不复制执行日志。
