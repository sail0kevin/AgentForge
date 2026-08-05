# AgentForge 当前开发状态
<!-- 文件名：2026-08-01 - current-development-status - 当前开发状态 -->

更新时间：2026-08-04（Asia/Shanghai）

## 当前目标

长期产品目标是构建面向 Web 项目的“需求到产品/UI实施报告”多智能体平台。用户输入产品或网站需求后，系统通过结构化需求分析、Planner、证据检索、多方案生成、交叉评审、评价与人工确认，最终生成体验优先、视觉优先和工程优先三套可交付产品/UI规格，并提供下游 AI 编程 Agent Prompt、Markdown 导出和真实网站验收反馈回写。

当前里程碑是“从需求到可恢复、可审计产品/UI报告组”的 Web MVP：认证用户可以在独立工作流页创建 baseline 或 model 任务，得到需求分析、补充问题、执行计划和动态目录，让计划授权的只读工具检索当前账号的版本化文档，生成独立 delivery/quality 候选、结构化 Finding 和 Evaluator 结果；缺失信息或高影响冲突会使用持久 Checkpoint 暂停，提交补充信息或人工裁决后从同一 thread 恢复；Reporter 随后生成并持久化三套产品/UI实施报告，报告中心支持查看、导出、复制下游 Prompt，并在网站真实运行后记录每套方案的通过或需修改结果。真实外部模型质量盲评和真实网站生成仍未完成；固定 SHA 只保证参考快照可复现，不代表许可证已经完成复用审计，也不代表下游网站已经通过验收。

## 产品/UI实施报告链路（2026-08-03）

- **已实现**：从已完成的评审工作流生成三套方案，分别表达体验、视觉和工程取舍；每套包含页面与路由、区块、状态、流程、失败恢复、设计方向、Design Token、组件、响应式规则、无障碍要求和视觉验收标准。
- **已实现**：`ProductUIReportGroup` 持久化、用户隔离、`groupId` 幂等、报告组状态、单套/整组 Markdown 导出、机器可读 JSON handoff、下游 AI 编程 Prompt 和网站真实验收反馈回写。
- **已实现**：报告中心为当前选中的方案提供唯一的“下载 JSON 交付包”入口，并展示完整 AI 执行报告 Markdown 预览；下游 AI 编程工具可直接消费同一份机器可读契约，不需要手工拼接 API 地址。
- **已实现**：反馈状态按真实结果收敛为 `generated`、`in_review`、`accepted` 或 `needs_revision`；反馈只能绑定报告组中存在的 `solutionId`。
- **已实现**：每套产品/UI规格新增交付边界和来源映射，具体记录需求目标、范围、计划任务、候选/评审意见、知识库与 GitHub/UI参考，并为每条结论标记 `implemented`、`target_design`、`verified` 或 `unverified`；默认 GitHub/UI 参考目录现在使用完整 commit SHA。
- **已实现**：报告 Markdown 和下游 Prompt 会导出上述映射；报告中心可查看包含/不包含范围、下游交接说明和每条结论的来源，避免把目标设计误认为已上线网站。
- **已实现**：导出状态声明已区分“完整 SHA 可复现”与“许可证复用审计、语义复核、真实网站验收”；固定版本不会被误写成完整来源审计。
- **已实现**：生成后验收要求结构化保存实际启动命令、访问地址、截图路径和测试/验收记录；缺少任一运行证据时，即使填写“通过”，报告组也只能保持 `in_review`。旧的自由文本反馈仍可读取，但不会推进到 `accepted`。
- **目标设计 / 未验证**：启动命令、访问地址、截图和验收记录必须来自下游真实运行环境；当前仓库只负责保存、展示和判定证据是否齐全，不宣称网站视觉、响应式或交互结果已经通过。
- **已验证**：报告生成契约测试覆盖三套方案、唯一方案标识、完整 SHA 的 GitHub/UI 参考证据，以及混合未固定证据仍保持 `not_yet_verified` 的边界；2026-08-03 完整 `quality:all` 已通过 `211/211` Unit、`25/25` Core E2E、`1/1` Session E2E、TypeScript、ESLint、51 份 Markdown 文档命名/本地链接校验和生产构建，随后 SQLite/PostgreSQL schema 校验也通过。
- **已验证**：在该完整门禁之后新增的产品/UI报告 E2E 已通过聚焦 `1/1` 与核心套件 `26/26`，浏览器覆盖唯一 JSON 下载链接、完整报告加载、验收表单的必填约束和证据回显；接口与报告中心真实下载覆盖单方案 JSON handoff、冻结双分支实验包、三方案运行证据回写和 `generated` → `in_review` → `accepted` 状态收敛。该测试使用隔离 SQLite 与预设运行证据夹具，不构成真实下游网站、视觉或用户验收。真实 Provider、目标环境数据库持久化和网站视觉验收仍需独立证据。
- **目标设计 / 待实测**：将用户实际选择的下游 AI CLI 接入编排器，对至少 6 个真实需求分别执行 Baseline 和 AgentForge 分支，再将源码、截图、交互和响应式结果与独立盲评一并交回验收；当前仓库未配置真实模型，也不声称已经生成或比较过真实下游网站。
- **未验证**：GitHub 参考目录已固定默认 SHA，但许可证复用审计、语义内容复核、真实 Provider 质量、真实视觉验收和生产 PostgreSQL 备份恢复仍需独立运行。
## 已完成
## 报告映射网站案例（2026-08-04）

### 已实现

- 三个可运行的报告映射路由：`/generated/attendance`（企业团队考勤工作台）、`/generated/atelier`（数字艺术展览）和 `/generated/nocturne`（数字聆听室）。
- 下游实现可依据 Product/UI 报告与 `implementation-manifest` 中的路由蓝图、视觉方向、组件、状态和响应式要求落地不同产品形态。
- 报告中心可下载单个方案的实施包 JSON；实施包包含评审溯源、交付边界、GitHub/UI 证据和验收矩阵。

### 已验证

- 三个案例均为仓库内可运行的 Next.js 页面；案例实现已纳入本地构建与交互检查记录。

### 目标设计 / 未完成边界

- 三个页面是人工或 AI 编程协作下的报告映射实现，不是从任意实施包自动编译网站的通用生成器。
- 案例中的业务数据、播放、收藏、生产部署和真实用户验收尚未生产化；真实模型盲评、人工 RAG Golden Set、真实 Provider 成本与延迟、目标环境 PostgreSQL 持久化、Docker、远程 CI 与生产负载仍需独立证据。


## Product/UI 报告到网站的对照实验闭环（2026-08-04）

- **已实现**：`npm run quality:product-ui:experiment-package` 可为每个冻结 Case 导出两条不可混用的下游实施输入：只含原始需求的 Baseline 直接 Prompt，以及携带冻结 `implementation-manifest` 的 AgentForge Prompt；同时分别输出管理员解盲映射和不含分支身份的盲评包。
- **已实现**：报告中心已提供“对照实验包”入口；用户为当前方案填入真实下游模型、Prompt 版本、Case/评分者门槛后，可直接下载同一协议的冻结材料。下载操作不会调用下游模型、不会生成网站，也不会把实验门槛误写成质量结果。
- **已实现**：运行记录、浏览器验收、输入 SHA/模型/Case 配对检查和成对盲评比较器可将两个分支的实际源码、截图、Playwright 证据和评分 Artifact 纳入同一协议；缺失、身份泄漏或输入不一致会拒绝质量比较。
- **已实现**：`npm run quality:product-ui:orchestrate -- --config <本地编排配置.json>` 可按用户明确配置执行下游生成器和预览命令，在预览地址可访问后调用 Runner；它保存生成/预览 stdout、stderr、`orchestration-summary.json` 和运行证据，并以环境变量向分支传递冻结输入。Baseline 会被主动隔离，不会获得 AgentForge Report/Manifest 路径；该命令不内置模型供应商、API 密钥或质量结论。
- **已实现**：报告中心可导入 Runner 生成的 `runtime-evidence.json`，仅接受与当前报告组和方案匹配的 `agentforge_manifest` 分支；导入只回填启动命令、预览地址、截图、探针与验收草稿，并强制保持 `needs_revision`，不会自动保存或自动通过。服务端同时拒绝 Baseline 分支、错误报告组或错误方案的运行证据。
- **已实现**：新增 Claude Code 受控生成器与 `quality:product-ui:claude-generator` 命令。生成器会校验冻结 Prompt SHA、强制配置目录与编排器 `generated-project` 一致、清除下游可见的实验包/报告路径；可选 `seedDir` 会被复制到本次独立项目目录，并输出 `seed-snapshot.json` 的递归文件哈希和数量。Baseline 与 AgentForge 必须复用同一份 seed，重复使用同一生成目录或输入泄漏都会拒绝运行。
- **已验证**：实验包构建和实际写盘导出均有自动测试，后者在临时目录检查 operator/admin/reviewer 三类产物隔离、Baseline 不携带 Manifest、评分材料不包含实际 Variant；测试产物会自动清理。
- **已验证**：编排器回归覆盖 Baseline 环境不暴露 Report/Manifest、生成失败不启动预览或验收、生成器与预览共享同一次 `generated-project`、成功路径将日志位置写入浏览器运行证据，以及真实本地 Node 子进程超时后终止并保留日志。Claude 生成器回归覆盖受控 seed 复制与哈希快照、目录不一致拒绝和重复输出目录拒绝。该验证使用模拟下游依赖，不构成真实模型调用或视觉质量证据。
- **已验证**：`npm run typecheck` 与 `npm run test:e2e:core` 于 2026-08-04 通过；核心 E2E 共 `26/26`，浏览器实际导入合法运行证据、保持“需修改”状态并保存，随后由 API 验证相同 `implementationRun.runId` 已持久化；Baseline、错误报告组和错误方案证据均被服务端拒绝。该回归使用隔离 SQLite 与夹具，只证明链路和约束，不构成真实下游网站或视觉质量结论。
- **待实测**：必须由同一真实下游模型、固定参数和独立评分者完成至少 6 个双分支 Case，才能报告描述性分差或判断 AgentForge 报告是否带来质量收益。
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
- TF-IDF 保留真实词频、使用正值平滑 IDF 和确定性排序；除原有3查询基线外，新增12类固定意图评测和读取 README/当前状态文档的6意图仓库冒烟评测
- Document保存 SHA-256、来源类型/URL、版本、许可和审查时间；检索返回完整 citation
- 前端能力库上传、列出、删除并启用当前账号的服务端 Document，浏览器片段不再注入模型
- 结构化 `knowledge-search`和 `ui-acceptance-check`只读 Tool，具备 Zod、计划授权、超时、次数、大小、幂等和审计
- Memory、Semantic Cache 和 File Reader仍未实现；Code Review 与 Bug Diagnosis 已通过“工程辅助”页面接入受限用户快照，不能读取真实仓库、执行代码或替代 SAST/自动修复
- 独立 delivery/quality Candidate、结构化 Finding、动态 Rubric 和 Evaluator
- 无证据 Finding 降级、Reviewer/Evaluator 失败披露、partial/inconclusive 终态和有限修订
- ReviewWorkflow 按用户、来源计划和独立 Run 持久化；人工裁决幂等且不可被不同请求覆盖
- `/api/reviews` baseline/model 双模式和 `/api/reviews/:id/approval` 人工确认 API
- 三类固定需求的 Review 流程契约评估，7项聚合指标均为1；该结果不代表真实模型语义质量
- P2-4 盲评工具链：冻结模型/RAG/预算元数据，匿名评分包与私有解盲表以材料包哈希绑定，并对漏评、重复runId、变体缺失及有限形式的身份泄露执行校验；已冻结12个案例（网站、后台、学习各4个）并提供SHA-256校验，确定性生成五种变体共60个唯一运行任务，提供案例哈希、协议版本和全部runId映射的独立预检命令，并可为每名评分者生成绑定packetId与60个blindId的独立评分模板；合成数据端到端演练已贯通，但仍未填入真实模型结果和2名独立评分者结果
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
- 工作台已改用持久需求任务：可按任务命名、选择成员、切换独立历史，并默认建立“产品/UI报告工作空间（需求澄清师 + 产品/UI报告架构师）”；清空历史不会删除任务或成员。旧工作空间名称仅作为升级兼容回退
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

## 当前可信基线（2026-08-03）

> 本节是 V2 推进中的状态校正。文档中保留的 2026-07-19 验收结果是当时发布快照，不覆盖之后尚未提交的 V1 后续实现。

- 已实现：Hybrid RAG（TF-IDF + bge-m3 Embedding + RRF）、24 条真实 LongCat-2.0 单 Agent / 完整多 Agent 对比、PostgreSQL Prisma schema 与独立 migration、`PostgresSaver` 环境开关及 WSL2 连接层验证；人工 RAG Golden Set 的 TSV 标注模板/编译器、项目 Markdown 文档冻结 CLI 和标注进度状态 CLI，可自动冻结来源快照哈希并复用独立审核契约；冻结人工集的分级 TF-IDF/Embedding/RRF 对比入口，绑定数据集哈希、来源快照哈希、正文语料哈希、embedding 模型与 RRF 参数。
- 已实现：四组消融实验基础设施；PostgreSQL 跨实例 crash recovery 集成测试；`DevelopmentWorkflow` 的持有者、单调递增 fencing token、条件领取/续租/状态写入保护；GitHub Actions 临时 PostgreSQL 集成验收 job；本地 `postgres-test` Compose profile 与一键隔离验收命令 `npm run test:integration:postgres:local`。该命令固定使用独立测试库、端口和临时数据目录，完成后仅清理自身 Compose 项目；现在同一入口也会执行 `pg_dump`/隔离库 `pg_restore` 备份恢复演练。PostgreSQL 集成测试仅接受专用测试连接串，不会写入常规开发 `DATABASE_URL`。
- 已验证：SQLite 租约迁移；RAG Golden Set v0 离线回归门禁（clean `Recall@1`、shared-noise `Recall@5` 与 `NDCG@10` 当前均为 1.0）；人工 Golden Set 的来源/独立审核契约与 100-case 就绪性校验；项目文档冻结 CLI 默认将8份当前 Markdown 文档冻结为193个 chunk，并成功生成待人工填写的 `sources.tsv`、`chunks.tsv`、空 `cases.tsv`；`quality:rag:human-golden:status` 对该本地包返回 `not_ready`，明确 0 个人工 case、低于 100-case 门槛，且 `api-reference` 来源已覆盖；空标注包 build 会被 `HUMAN_GOLDEN_TSV_NO_RECORDS: cases.tsv` 拒绝；分级检索指标、正文哈希绑定和空/小样本 `not_ready` 边界测试；RRF 网格候选的固定选择规则（Recall@K、NDCG@K、MRR、无关结果率、较小 k）；同进程 OTel 嵌套 span 上下文；前序 Agent 上下文的滑动窗口裁剪；四臂消融计划的无费用预检（24 个案例 x 5 次重复 x 4 臂，共 480 条冻结运行，不读取模型密钥、不调用模型，实际外部支出为 `$0`）；离线授权预检可在不读取凭证的条件下验证冻结计划、授权绑定和预算覆盖；P0-1 执行路径审计已修正 C/D 组在补充假设后二次结构化分析重试的最坏调用数，当前协议储备为单条最高 `$1.0902`、完整计划 `$329.904`，仍未调用模型；授权模板生成器可生成绑定当前冻结计划的 `pending` 文件，且该文件会被执行预检拒绝；`npm run typecheck`、`npm run test:unit`（157 passed, 0 failed, 0 skipped）、`npm run db:validate`、`npm run db:validate:postgres`；定向 ESLint 为 0 error、0 warning。
- 已知事实：24 条探索性评测中，单 Agent 覆盖率为 99.3%，完整多 Agent 为 86.2%；评分是关键词 checklist，且观测到模型输出波动，尚不能归因或宣称质量收益。
- 已验证（WSL 专用临时库）：最近一次 `npm run test:integration:postgres:wsl` 创建并清理随机数据库 `agentforge_p0_wsl_5ab6c36a9436f370`，完成三条 migration、跨 Saver/Graph Checkpoint 恢复，以及多进程租约领取、续租、竞争接管与旧 token 拒写。待实测：真实模型四组消融实验；GitHub Actions 临时 PostgreSQL job 或本机 Docker 专用测试库的独立环境复验。Docker Desktop 安装包已下载并完成 SHA-256 校验，但尚未安装或启动，因此本机 Docker CLI 仍不可用；WSL 结果不等同于远程 CI、生产负载、队列、exactly-once 或多地域验证。RAG Golden Set v0 已有 12 条确定性 fixture 和 CI 不退化门禁；人工标注包已覆盖 `api-reference` 来源，但 100+ 多来源人工标注集以及基于真实人工语料的 Recall@5/MRR/NDCG@10 对比仍未产生，不能据此调整 RRF 参数；后台队列仍未实现。真实 Provider 的上下文裁剪 token、延迟与成本收益也尚未测量。

后续实施以 `docs/2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md` 的“当前实施状态与修订执行顺序”为准；任何目标设计都不得写作已实现。

```bash
npm run quality:all
```

该统一门禁依次执行固定检索夹具、仓库文档检索、盲评清单与运行计划校验、盲评合成端到端演练、单元测试、核心 E2E、Session 隔离 E2E、TypeScript、ESLint 和 Production Build。2026-08-01 最近一次完整运行退出码为 `0`：157/157 Unit、24/24 Core E2E、1/1 Session E2E，类型检查、ESLint 和 Production Build 均通过；仓库文档检索仍为固定 6-case 冒烟验证，不能替代真实语义质量评测。该次修复了 E2E `next dev` 生成的临时 `.next/dev/types` 污染后续类型检查的问题：E2E 现在使用并在结束后清理专用 `.next-e2e` 构建目录，完整门禁已按该顺序复验。

## 2026-08-03 最新完整门禁补充

- 历史完整门禁（2026-08-03）曾通过 `211/211` Unit、`25/25` Core E2E、`1/1` Session E2E、覆盖率、TypeScript、ESLint、51 份 Markdown 文档校验和生产构建。补齐产品/UI实验包导出 E2E 后，2026-08-04 已重新执行 `npm run quality:all` 并成功退出；其中 Core E2E 为 `26/26`、Session E2E 为 `1/1`，同时覆盖密钥卫生、RAG 回归、盲评工具链演练、单测/覆盖率、文档校验和生产构建。
- Session 隔离 E2E 已适配当前首页默认进入“交付台”的流程，并验证进入“Agent 配置与调试”、能力库访问和登出后返回“登录 AgentForge”。
- 仓库文档检索仍是固定 6-case 冒烟验证；真实 Provider 消融实验、人工 RAG Golden Set、目标环境 PostgreSQL/Docker/远程 CI、生产负载和下游网站视觉验收仍未完成。

## 正式目标设计

## 2026-08-02 当前推进记录

### 内部试点反馈闭环

- **已实现**：终态工作流页面新增结构化“试点反馈”入口，支持报告可用性、人工修改、干预原因、证据问题类型、失败分类和备注；同一工作流的反馈可以更新。
- **已实现**：反馈 API 只允许当前用户访问自己的终态工作流，拒绝运行中、等待澄清和等待人工裁决的工作流；数据模型不保存 Prompt、原始模型输出或 Provider 凭证。
- **已实现**：新增 `npm run pilot:feedback-summary` 受控运维汇总命令。它只输出匿名计数、比例、时间窗口和数据完整性信号；不输出工作流 ID、需求、Prompt、原始模型输出、备注或凭证。需要留存结果时，负责人只能显式写入 Git 忽略的 `local-only/`，例如 `npm run pilot:feedback-summary -- --output=local-only/pilot-feedback/summary.json`。
- **已验证**：反馈契约和映射测试通过，当前专项运行结果为 `189 passed, 0 failed, 0 skipped`；TypeScript 和 ESLint 通过。
- **已验证（2026-08-02 本机开发库）**：已应用 `20260802010000_add_pilot_feedback` migration；匿名汇总命令成功运行并返回 `sampleSize: 0`、`not_ready`，没有生成虚构业务指标。新增汇总专项测试与现有反馈/预检测试共 `11/11` 通过，TypeScript 和定向 ESLint 通过。
- **待实测**：真实试点用户是否提交反馈、报告可用性、人工修改率、证据问题和失败分类分布。汇总工具的默认描述性阈值是 20 条反馈；达到阈值后也只能提供描述性信号，不能单独推导用户价值、模型质量或因果效果。

- 已实现：Tier 2 证据核验的可选注入接口，支持 `entailed`、`not_entailed`、`unknown`，并在主评审流程中披露结果；未配置或核验失败时不会伪造语义支持，也不会改变现有人工审批门禁。
- 已实现：新增内部试点配置预检命令 `npm run pilot:readiness` 与 `npm run pilot:readiness:production`。预检不会自行读取 `.env`、连接数据库、执行迁移、调用 Provider 或输出密钥；生产目标要求 session 鉴权、长度不少于 32 的非占位密钥、PostgreSQL `DATABASE_URL`、PostgreSQL Checkpointer，以及关闭 Checkpointer 自动建表。
- 已验证（历史中间快照，后续已增加试点反馈测试）：Tier 2 聚焦测试与当时主链测试通过；当时本地完整单元测试为 `185/185`，TypeScript、ESLint、生产构建和 `src/lib/**` 覆盖率门禁通过，覆盖率为行 `92.43%`、分支 `87.59%`、函数 `89.67%`。本机开发预检通过并如实提示临时开发加密密钥；本机生产预检因未配置目标环境密钥、PostgreSQL 与 Checkpointer 而按预期失败，说明它能阻止未配置环境被误作为试点发布。该数字仅作历史中间快照，当前完整门禁以本节 2026-08-02 记录为准。
- 已实现并已验证（WSL 专用临时库）：PostgreSQL 验收入口与 CI job 现在先执行 Prisma migration，再独立执行 `npm run db:setup:workflow-checkpoints`；跨实例恢复测试不再自行建表，只验证已初始化表。最新 WSL 随机库已完成 5 条 migration（含 `20260802010000_add_pilot_feedback`）、Checkpointer 初始化、跨 Saver/Graph 恢复和多进程租约/Fencing 测试，随后删除数据库与角色。本地 Docker 验收入口已扩展到备份恢复演练，但当前 Windows 主机没有 Docker CLI，尚未产生 Docker 运行证据。该结果不等同于 Docker、远程 CI、目标环境备份恢复或生产负载验收。
- 已验证：文档命名与本地链接校验通过，当前共 `50` 份 Markdown 文档；新增内部试点交付计划和简历项目描述，明确了可交付边界和不可承诺事项。
- 待实测：真实本地 NLI 模型、语义错误语料、阈值、Precision/Recall、延迟和资源消耗；当前仍不能称为生产级语义蕴含能力。
- 待外部证据：目标环境数据库迁移、Checkpointer 建表、连通性与备份恢复演练；P0-1 真实 Provider 消融实验、Docker/远程 CI PostgreSQL 验收、真实人工 RAG Golden Set（含 query、相关性标签和独立复核）和生产负载数据。生产预检通过不替代这些证据。

仓库已新增 [后续架构设计文档](./design - 产品设计方案/旧 - design-index - 设计文档总入口.md)。当前手动双 Agent 运行已经使用 LangGraph 单 Agent 图作为每个 Agent 的执行内核；现有路由仍负责 SSE、持久化、失败继续和凭证安全。

结构化 Planner、计划校验、动态目录、PlanningArtifact、版本化知识检索、受控只读 Tool、候选方案、交叉评审、Evaluator、有限修订、人工确认、ReportArtifact、动态报告、Markdown导出、报告中心、产品级工作流页和Checkpoint恢复均已实现。

## 已知限制

- RAG 已包含 TF-IDF、bge-m3 Embedding 与 RRF 融合；Golden Set v0 和仓库文档冒烟评测仅是离线回归保护，尚不足以代表通用检索或真实生产语料质量。
- Review当前只有3类确定性流程契约样例；盲评工具链和协议已具备，但尚未完成单 Agent、双 Agent、双 Agent + RAG、交叉评审和人工裁决的真实模型盲评，因此不能宣称报告语义质量已经提升。
- 盲评基础设施已完成冻结清单、预算、最低案例/评分者门槛、评分包需求上下文与身份泄露偏差的协议门禁加固；当前仍只能用于合成工具链演练，尚未有真实模型输出和至少两名独立评分者的结果，因此不能作质量比较结论。
- 当前正式报告已支持单套/整组 Markdown 导出和机器可读 JSON 交付包；PDF/DOCX 尚未决定是否纳入交付范围。
- 对话、报告和工作流已经分为独立页面；Checkpoint 默认使用本地 SQLite，也可切换 PostgreSQL。跨实例恢复集成测试、租约与 Fencing Token 已实现，并已在 WSL 专用随机临时 PostgreSQL 库完成恢复及多进程验收；Docker Compose 和当前提交对应的远程 CI 回传仍待补充。
- 受控 Tool API和工作流适配器已完成，但模型供应商原生 function/tool calling 和面向任意专业任务的自动调度仍未接入。
- 0.1正式交付范围为Web MVP；Electron壳仅为实验入口，尚未完成数据目录、安装后migration、端口、签名和干净机器验收，不得描述为已交付桌面版。
- 完整全项目 lint已通过：Electron `.cjs`保留正确CommonJS格式并使用定向规则，archive从活动代码检查排除，旧生成脚本无效变量已删除。
- Provider 超时和客户端取消已覆盖当前单进程 Web MVP；反向代理、Serverless 和多实例部署仍需环境验证。
- `.env` 已停止 Git 跟踪；已提供无回显轮换验收命令，但历史真实密钥和 Secrets 仍需要在对应服务商后台人工轮换并确认。
- PostgreSQL 已有独立 migration history；WSL 专用随机临时库已完成迁移应用、跨实例恢复与多进程租约实测，当前缺少 Docker Compose 和当前提交对应的远程 CI 独立环境证据。
- 浏览器旧知识键只做安全清理，不再作为运行时知识源；服务端 Document/Chunk是唯一产品知识入口。
- 无 Content-Length 时，multipart 请求进入进程前的硬限制仍依赖反向代理或云平台；应用会在内容读取前按 file.size 拒绝。

## 当前实施主线

1. 完成安全轮换；Phase 1和统一 RunService均已完成。
2. 结构化需求分析、Planner、计划校验和动态目录已完成。
3. 本地知识、RAG修复和受控 Tool已完成。
4. 候选方案、交叉评审、Evaluator、有限修订和人工确认的工程闭环已完成。
5. ReportArtifact持久化、动态报告、来源追踪、版本、幂等、Markdown导出和报告中心已完成。
6. Phase 7已完成：前端结构、Workspace创建契约、全量质量检查和Web/Electron交付边界已收口。
7. 当前 V2 主线等待负责人授权后收集冻结四臂消融实验的真实模型输出并进行配对统计；P0-2 已完成 WSL 专用临时库验收，后续补充 Docker/CI 环境证据。任何外部模型调用均需负责人显式确认预算。
## 2026-08-03 最新完整质量门禁

### 已实现

- `quality:all` 已纳入密钥卫生、RAG fixture 基线与 Golden Set、仓库冒烟、盲评工具链演练、单元测试、覆盖率、两类 E2E、类型检查、ESLint、文档命名与本地链接检查和生产构建。
- 新增 `quality:pilot`，先执行生产试点配置预检，再执行完整质量门禁。

### 已验证

- 本机 `npm run quality:all` 已成功退出，未调用 Provider、未产生外部费用。
- 历史完整门禁（2026-08-01）：单元测试 `193/193`；`src/lib/**` 覆盖率：行 `92.30%`、分支 `87.62%`、函数 `89.49%`。历史聚焦验证（2026-08-02）：`208/208` Unit、`db:validate`、`db:validate:postgres`、TypeScript、ESLint 和生产构建通过；当时未把结果写成完整 E2E 或 `quality:all`。
- 最近一次完整门禁（2026-08-04）：本机 `npm run quality:all` 已在加入下游实施编排器后成功退出；230 个单元测试与覆盖率门禁、核心 E2E `26/26`、Session 隔离 E2E `1/1`、TypeScript、ESLint、55 份 Markdown 的命名/本地链接校验和 Next.js 生产构建均通过。产品/UI用例覆盖单方案 JSON handoff、双分支实验包导出、三方案运行证据回写和报告组状态从 `generated` 经 `in_review` 收敛至 `accepted`；编排器单元回归覆盖分支输入隔离、失败短路、日志溯源和真实子进程超时终止。该门禁不调用下游模型，证明的是产品链路回归，不代表已经生成或验收真实下游网站。

### 2026-08-02 P0-1 最新无费用证据

- **已验证**：使用冻结的 24 案例 x 5 重复 x 4 臂计划执行 `quality:ablation:budget` 与默认 `quality:ablation:run`。预算快照计算出单条最高协议储备 `$1.0902`、完整 480 条计划协议储备 `$329.904`；预检输出 `preflight_only`，确认声明总预算刚好覆盖冻结计划。
- **已验证**：该预检不读取模型环境变量、不读取 `.env`、不调用 Provider、不创建结果 ledger；本次实际外部支出仍为 `$0`。回归测试覆盖逐臂总储备展示，避免把每条运行错误按最高成本臂相乘。
- **已实现**：已在 `local-only/ablation/2026-08-02-execution-authorization.template.json` 生成与当前计划指纹绑定的 `pending` 授权模板。它不是批准；真实运行仍需负责人填完模型、Prompt/RAG 快照、私有路径和费用批准，并将其独立审核后转为 `approved`。
- **已验证**：旧的 `local-only/ablation/execution-authorization.json` 在离线预检中被拒绝，原因是它仍为 schema v1，且缺少 v2 所需的输入/输出 token 上限与定价快照；其 `$0.01/条、$5` 上限也无法覆盖当前冻结计划的 `$1.0902/条、$329.904` 协议储备。该拒绝发生在读取 `.env` 或调用 Provider 之前。

### 2026-08-02 RAG 人工 Golden Set 工作清单收尾

- **已实现**：新增 `quality:rag:human-golden:worklist`，把已冻结的项目文档语料转换成人工标注任务清单；输出限定在 `local-only/`，不会写入 `cases.tsv`。
- **已实现**：新增 `quality:rag:human-golden:worklist-to-cases`，只把 `reviewStatus=approved` 且人工字段完整、独立 reviewer 通过、所选 chunk 相关性达标的 worklist 行转换为 `cases.tsv`；它不会生成 query、相关性标签或任何检索指标。
- **已验证**：本次用 8 个 source、193 个 chunk 生成 100 条标注任务，覆盖 `technical`、`business`、`api-reference` 和 `runbook`；其中必需的 `technical`、`business`、`api-reference` 均已覆盖。
- **已验证**：worklist 现包含 19 列，其中 `caseId`、`humanQuery`、`queryType`、`relevantChunksJson`、标注/复核人与时间、`reviewStatus` 和 `notes` 等人工字段保持空白，等待人工填写后再转换。
- **已验证**：当前人工标注包仍为 `not_ready`，`caseRowCount=0`、`validCaseCount=0`；工具链明确拒绝把空 `cases.tsv` 当作评测数据。
- **待人工**：仍需至少 100 条人工 query、相关性标签和独立 reviewer 批准；完成前不能宣称真实 RAG Recall@5、MRR、NDCG 或调参结论。

### 待实测

- 本机未配置试点目标环境，因此 `quality:pilot` 的生产预检按设计不能通过；它不能被本地开发配置替代。
- 上述结果不证明真实 Provider 多 Agent 质量、真实 RAG 语义召回、成本/延迟收益、目标环境 PostgreSQL 备份恢复、Docker/远程 CI 验收或真实用户效果。
