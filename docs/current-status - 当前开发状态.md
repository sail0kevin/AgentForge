# AgentForge 当前开发状态
<!-- 文件名：current-status - 当前开发状态 -->

更新时间：2026-07-16（Asia/Shanghai）

## 当前目标

长期产品目标是构建面向 Web 项目的多智能体需求规划与开发方案生成平台。用户输入需求后，系统通过结构化需求分析、Planner、专业知识工具、候选方案、交叉评审、评价与人工确认，最终生成带依据、风险和实施步骤的动态开发方案报告。

当前里程碑是“从需求到可恢复、可审计动态报告”的 Web MVP：认证用户可以在独立工作流页创建 baseline或model任务，得到需求分析、补充问题、执行计划和动态目录，让计划授权的只读工具检索当前账号的版本化文档，生成独立 delivery/quality 候选、结构化 Finding 和 Evaluator 结果；缺失信息或高影响冲突会使用持久Checkpoint暂停，提交补充信息或人工裁决后从同一thread恢复；Reporter最终生成带版本、状态、来源和导出的 ReportArtifact，并在独立报告中心展示。真实外部模型质量盲评仍未完成。

## 已完成

- 多 Agent 顺序执行和前序输出传递
- 单 Agent 失败后继续后续 Agent
- 运行终态统一聚合：预算耗尽优先，任一 Agent 失败不会被后续成功覆盖
- 手动运行服务端锁、唯一 runId、Run/消息/用量关联和锁所有权释放
- Ollama、OpenAI-compatible、Anthropic 统一 Provider 超时和 AbortSignal 取消
- SSE 客户端取消后中止当前 Provider，并停止后续 Agent
- SSE 运行事件和错误脱敏
- 消息刷新恢复与清空
- Agent 能力配置和轻量 TF-IDF RAG
- Session/local 身份模式与核心用户隔离
- 登出清空瞬时 Store，旧消息不再从 localStorage降级恢复；浏览器旧知识键只清理、不再进入运行时
- 文档上传请求/文件双层字节边界、严格 UTF-8、用户容量/Chunk 配额和事务回滚
- 手动、持久和 Demo三入口共享 RunService、Prisma/内存适配器与 v1事件契约
- 结构化 RequirementAnalysis、ExecutionPlan、ReportSection和 BudgetState契约
- 认证 `/api/plans`：需求分析、关键缺失信息追问、动态计划与报告目录
- Planner服务端白名单、DAG、任务数、轮次、Token、费用和章节引用校验
- 模型结构化输出机器可读 Schema、默认两次有限重试和稳定失败码
- PlanningArtifact按 userId/runId持久化成功、待补充和失败终态
- Markdown保留 H1～H6标题路径和真实行号后切块，长章节子块继承来源
- TF-IDF保留真实词频、使用正值平滑 IDF和确定性排序，固定3查询基线 Recall@1/MRR=1
- Document保存 SHA-256、来源类型/URL、版本、许可和审查时间；检索返回完整 citation
- 前端能力库上传、列出、删除并启用当前账号的服务端 Document，浏览器片段不再注入模型
- 结构化 `knowledge-search`和 `ui-acceptance-check`只读 Tool，具备 Zod、计划授权、超时、次数、大小、幂等和审计
- 未实现的 Memory、Semantic Cache、File Reader和 Code Review在界面标记“规划中”且不可启用
- 独立 delivery/quality Candidate、结构化 Finding、动态 Rubric 和 Evaluator
- 无证据 Finding 降级、Reviewer/Evaluator 失败披露、partial/inconclusive 终态和有限修订
- ReviewWorkflow 按用户、来源计划和独立 Run 持久化；人工裁决幂等且不可被不同请求覆盖
- `/api/reviews` baseline/model 双模式和 `/api/reviews/:id/approval` 人工确认 API
- 三类固定需求的 Review 流程契约评估，7项聚合指标均为1；该结果不代表真实模型语义质量
- P2-4 盲评工具链：冻结模型/RAG/预算元数据，匿名评分包与私有解盲表以材料包哈希绑定，拒绝泄露、漏评、重复和变体缺失后自动汇总；预注册门槛为12个案例、2名独立评分者，尚未填入真实模型结果
- DevelopmentReport、Chapter、Claim、SourceManifest和ReportBudget机器可读契约
- ReportArtifact不可变版本链、parentReportId和generationKey幂等回放
- baseline/model Reporter、两次有限结构化重试、预算、敏感输入预拦截和失败用量记录
- 动态章节/来源/状态服务端复验，知识来源只能来自已审计knowledge-search输出
- `/api/reports`列表/生成、详情、再次校验后的Markdown导出和跨用户404隔离
- `/reports`独立报告中心：版本、状态、决策、动态目录、风险、未决项、来源和导出
- 产品级LangGraph统一Planner、双候选、Reviewer、Evaluator、人工确认和Reporter，baseline/model共用同一状态图
- `/workflows`独立工作流页：七节点时间线、模型角色配置、暂停表单、Artifact链、安全Checkpoint标识和故障恢复
- clarification与approval使用持久interrupt/resume；相同thread恢复，不重复已完成计划、评审、裁决或报告副作用
- DevelopmentWorkflow、WorkflowNode、独立SQLite Checkpoint、节点幂等键、乐观版本和30分钟故障恢复租约
- Workflow列表、详情、resume、recover均按当前用户隔离；浏览器不接收完整Checkpoint
- Workspace创建会校验当前用户Agent归属、拒绝重复ID并按请求顺序原子创建WorkspaceAgent关联
- 聊天页已改用持久任务对话空间：可按任务命名、选择成员、切换独立历史，并默认建立“开发报告生成（需求分析师 + 开发报告负责人）”；清空历史不会删除空间或成员
- Workspace前端已按控制器、文案、类型、导航、对话、Agent、知识/Tool、看板和设置拆分；主控制器约1550行降至约458行
- 持久工作区已具备 Run、activeRunId所有权、LangGraph、RAG能力判断和统一 SSE取消
- 能力库的知识文档按账号共享；只有绑定 `RAG Retrieval` 的智能体会在所属空间的运行前检索文档。普通对话不会自动执行 Tool Calling，受控 Tool只在授权的计划/工作流调用中执行并审计
- API Key 服务端加密、掩码 DTO 和浏览器防泄漏；管理页统一显示全局供应商密钥与智能体专属密钥，并给出“已加密保存 · 掩码”确认；编辑智能体时输入框按原 Key 长度显示保密圆点，只有用户输入新值才会替换旧密钥
- 手动运行成功消息与 TokenUsage 原子持久化
- 主题和语言刷新持久化
- 核心 Playwright验收（24项，包含Workspace-Agent原子绑定、ReportArtifact、baseline/model工作流、Checkpoint恢复、模型完整角色链和受控Tool）
- Session账号切换 Playwright验收（A→B→A，文档、计划、Run、Tool、Review、Report、Workflow详情/resume/recover与瞬时状态隔离，1项）
- SQLite/PostgreSQL Prisma schema 静态校验
- 九次标准 SQLite migration和隔离数据库核心 E2E（24项）；旧初始开发库可先自动备份再安全baseline和升级
- `.env` 已停止 Git 跟踪，本机文件保留；`security:verify-secrets` 可无回显检查跟踪状态、常见泄露特征与 session/production 密钥就绪状态
- Next.js 生产构建，运行时数据库路径不再触发NFT全仓库追踪警告

## 核心验收命令

```bash
npm run test:e2e:core
npm run test:e2e:session
npm run db:validate
npm run build
```

## 正式目标设计

仓库已新增 [后续架构设计文档](design - 产品设计方案/README - 设计文档总入口.md)。当前手动双 Agent 运行已经使用 LangGraph 单 Agent 图作为每个 Agent 的执行内核；现有路由仍负责 SSE、持久化、失败继续和凭证安全。

结构化 Planner、计划校验、动态目录、PlanningArtifact、版本化知识检索、受控只读 Tool、候选方案、交叉评审、Evaluator、有限修订、人工确认、ReportArtifact、动态报告、Markdown导出、报告中心、产品级工作流页和Checkpoint恢复均已实现。

## 已知限制

- RAG仍为 TF-IDF，不是 embedding/pgvector；当前固定评测只有3个查询，尚不足以代表真实项目质量。
- Review当前只有3类确定性流程契约样例；盲评工具链和协议已具备，但尚未完成单 Agent、双 Agent、双 Agent + RAG、交叉评审和人工裁决的真实模型盲评，因此不能宣称报告语义质量已经提升。
- 当前正式报告导出只有Markdown；PDF/DOCX尚未决定是否纳入交付范围。
- 对话、报告和工作流已经分为独立页面；Checkpoint当前使用本地SQLite，尚未验证共享Checkpointer和多实例部署。
- 受控 Tool API和工作流适配器已完成，但模型供应商原生 function/tool calling和 Planner自动任务调度仍未接入。
- 0.1正式交付范围为Web MVP；Electron壳仅为实验入口，尚未完成数据目录、安装后migration、端口、签名和干净机器验收，不得描述为已交付桌面版。
- 完整全项目 lint已通过：Electron `.cjs`保留正确CommonJS格式并使用定向规则，archive从活动代码检查排除，旧生成脚本无效变量已删除。
- Provider 超时和客户端取消已覆盖当前单进程 Web MVP；反向代理、Serverless 和多实例部署仍需环境验证。
- `.env` 已停止 Git 跟踪；已提供无回显轮换验收命令，但历史真实密钥和 Secrets 仍需要在对应服务商后台人工轮换并确认。
- PostgreSQL 当前仅做 schema 静态校验，尚未建立独立 migration history。
- 浏览器旧知识键只做安全清理，不再作为运行时知识源；服务端 Document/Chunk是唯一产品知识入口。
- 无 Content-Length 时，multipart 请求进入进程前的硬限制仍依赖反向代理或云平台；应用会在内容读取前按 file.size 拒绝。

## 当前实施主线

1. 完成安全轮换；Phase 1和统一 RunService均已完成。
2. 结构化需求分析、Planner、计划校验和动态目录已完成。
3. 本地知识、RAG修复和受控 Tool已完成。
4. 候选方案、交叉评审、Evaluator、有限修订和人工确认的工程闭环已完成。
5. ReportArtifact持久化、动态报告、来源追踪、版本、幂等、Markdown导出和报告中心已完成。
6. Phase 7已完成：前端结构、Workspace创建契约、全量质量检查和Web/Electron交付边界已收口。
7. 当前剩余主线为按已冻结盲评协议收集真实模型输出和独立人工评分，再解盲汇总；共享Checkpointer/多实例恢复、PDF/DOCX和完整可访问性审计单独排期。
