# AgentForge V2 验收与实验指南

> 版本：v2.2 | 更新日期：2026-08-01
>
> 本文是 V2 的当前执行依据。早期五臂方案、预设覆盖率目标和“Reviewer 必然是根因”的表述已经废止，不得据此调参或对外陈述。

## 证据状态

| 范围 | 已实现 | 已验证 | 待实测 / 目标设计 |
|---|---|---|---|
| P0-1 消融 | 四臂编排、冻结计划、案例哈希、私有 ledger、排除项、配对 bootstrap 报告，以及原始输出路径/内容哈希审计 | 确定性协议、ledger 和原始输出审计单测；2026-07-31 的 480 条冻结运行无模型 preflight | 真实模型四臂结果与根因结论 |
| P0-2 Checkpoint | SQLite / Postgres 后端选择、跨实例 crash recovery 测试、租约与 fencing 写入保护；GitHub Actions 临时 PostgreSQL 验收 job | SQLite 迁移和租约单测；WSL 随机专用临时库上的迁移、跨实例恢复和多进程租约/Fencing 验收 | Docker Compose 与 GitHub Actions 的独立环境回传；不包含生产负载、队列或 exactly-once |
| RAG | Hybrid RAG、Golden Set v0、CI 不退化门禁（含 NDCG@10）、人工 Golden Set 来源/独立审核契约与 100-case 就绪性校验、项目 Markdown 文档冻结入口、可审计的 RRF 网格选择记录 | 冻结 fixture 的离线基线；人工标注契约、项目文档冻结/prepare 链路与 RRF 选择规则单测 | 多来源人工标注集、真实 RRF 调优 |
| 工程化门禁 | GitHub Actions 执行 lint、类型检查、单元测试、`src/lib/**` 覆盖率门禁（行/分支/函数各 >= 80%）、RAG Golden Set 与生产构建；独立 PostgreSQL job 执行迁移和集成测试 | 最近一次本地完整门禁的覆盖率为行 92.30%、分支 87.62%、函数 89.49%；CI 配置进入当前工作区 | 当前提交尚无远程 GitHub Actions 成功回传；覆盖率范围不代表端到端、Provider 或生产环境覆盖率 |
| 成本 | `priorAssistantMessages` 滑动窗口裁剪 | 纯函数单测 | 真实 Provider 的 token、延迟和成本收益 |
| 可观测性（P2 最小基础） | 本地 OTel span 适配层；Run/Agent 与产品工作流节点 span；同进程嵌套 span 活动上下文；显式配置才启用的 Node.js OTLP/HTTP Exporter | span 关闭、真实 `LLMResult` token/cost 属性、嵌套 span 上下文、敏感需求文本不写入属性，以及 OTLP 默认关闭/配置解析单测 | Collector/Jaeger/Tempo 连通性、真实 Provider 指标与跨进程 trace 传播 |

消融授权文件可由 `npm run quality:ablation:authorization-template` 生成。模板只表示待填写状态，不能代替
负责人审批；真实执行前必须通过 `authorization-preflight`，并同时使用 `--execute --confirm-external-costs`。

## P0-1：四臂消融实验

实验臂固定为：

| 组 | 变体 | 目的 |
|---|---|---|
| A | `single_agent` | 单 Agent 基线 |
| B | `dual_candidate_no_review` | 判断双候选本身的影响，不隐式选择候选 |
| C | `single_candidate_with_review` | 隔离 Review / Evaluator 的影响 |
| D | `full_multi_agent` | 完整链路；与 C 仅相差候选数量 |

### 1. 冻结运行计划（无网络、无模型调用）

```powershell
npm run quality:ablation:plan -- `
  --trials 5 `
  --execution-order-seed 20260801 `
  --output local-only/ablation/run-plan.json
```

24 个案例、5 次重复、4 个实验臂会得到 480 条冻结运行。任何比较必须使用同一个 `caseId + trial`；每次失败、超时或空输出必须写为 `excluded`，不得补零或静默移除。每个 `caseId + trial` 配对块内的四臂真实执行顺序由冻结的 `executionOrderSeed` 确定性随机化，降低固定 A/B/C/D 顺序受到 Provider 时间波动、限流或服务状态变化影响的风险；该种子和运行计划哈希必须随 ledger 一起保留。

### 2. 真实执行前的负责人确认项

- Provider 和精确模型版本；
- 温度、Planner / Review Prompt 版本、RAG 快照；
- 每次运行与总成本上限；
- `local-only/` 下原始输出、结果 ledger 的私有保存位置；
- 是否允许实际消耗外部模型费用。

未得到明确确认时，只允许运行 preflight。下列命令默认不读取模型环境变量、不会发起请求：

```powershell
npm run quality:ablation:run -- `
  --plan local-only/ablation/run-plan.json `
  --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" `
  --ledger local-only/ablation/result-ledger.json `
  --raw-output-root local-only/ablation/raw `
  --max-cost-usd-per-run 0.01 `
  --max-total-cost-usd 5
```

负责人填写授权记录后、执行真实模型调用前，先运行以下**离线授权预检**。该命令只读取冻结计划、案例清单和 `local-only/` 下的授权 JSON，验证案例/计划哈希、私有输出路径和总预算是否覆盖全部冻结运行；它不会加载 `.env`、读取 Provider 凭证、写入 ledger 或调用模型：

```powershell
npm run quality:ablation:authorization-preflight -- `
  --plan local-only/ablation/run-plan.json `
  --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" `
  --authorization-file local-only/ablation/execution-authorization.json
```

只有预检输出 `authorization_preflight_passed` 后，负责人确认外部成本，才可在上述参数基础上补充冻结信息和双确认开关：

```powershell
npm run quality:ablation:run:env -- `
  --plan local-only/ablation/run-plan.json `
  --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" `
  --ledger local-only/ablation/result-ledger.json `
  --raw-output-root local-only/ablation/raw `
  --max-cost-usd-per-run <confirmed-per-run-budget> `
  --max-total-cost-usd <confirmed-total-budget> `
  --temperature <frozen-temperature> `
  --provider longcat-openai-compatible `
  --model <exact-model-version> `
  --planner-prompt-version <frozen-planner-version> `
  --review-prompt-version <frozen-review-version> `
  --rag-snapshot <frozen-rag-snapshot> `
  --authorization-file local-only/ablation/execution-authorization.json `
  --execute `
  --confirm-external-costs
```

真实运行会在每一次 Provider 调用前将 `inFlightRunId` 原子写入私有 ledger，调用结束后立即原子写入结果和原始输出。若进程在调用期间中断，下一次运行会拒绝自动续跑该条目，必须先按 Provider 账单人工核对，避免重复计费；只有完整、无 `inFlightRunId`、成本未超冻结上限，且每个完成结果的原始输出仍位于私有根目录并通过 SHA-256 审计的 ledger 才能生成统计报告。

### 3. 生成统计报告（不调用模型）

```powershell
npm run quality:ablation:report -- `
  --plan local-only/ablation/run-plan.json `
  --ledger local-only/ablation/result-ledger.json
```

报告输出 A 对 B/C/D 的 coverage 与约束满足率配对均值差、bootstrap 95% 区间、可用对数和排除数。报告会先验证每个完成运行的原始文件存在、没有越出 `rawOutputRoot`、且文件内容哈希仍与 ledger 相符；任一失败时拒绝生成结论。关键词 checklist 只衡量已注册关键词覆盖，不代表技术正确性、可行性或人工偏好。没有真实 ledger 前，不能作根因结论。

## P0-2：PostgreSQL Checkpointer 与租约

### 已实现边界

- `WORKFLOW_CHECKPOINT_BACKEND=postgres` 使用 `PostgresSaver`，SQLite 仍是默认后端；
- 独立 Saver 和 Graph 的 crash recovery 集成测试仅读取 `AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL`；
- `DevelopmentWorkflow` 使用 `leaseOwnerId`、单调递增 `leaseToken`、条件领取、续租和 fenced 状态写入。

### 专用数据库验收

准备一个只用于测试的 PostgreSQL 数据库，完成迁移后设置环境变量。禁止将生产或日常开发连接串用于此命令：

```powershell
$env:AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL = "postgresql://...专用测试库..."
npm run test:integration:postgres-checkpoint
npm run test:integration:postgres-workflow-lease
```

本机安装 Docker 后，优先使用项目提供的一键隔离入口：

```powershell
npm run test:integration:postgres:local
```

该入口会以独立 Compose 项目临时启动 `postgres-test`：固定使用 `agentforge_v2_test` 数据库、宿主机 `5433` 端口和临时数据目录；脚本自行覆盖 `DATABASE_URL` 与两个 `AGENTFORGE_POSTGRES_*_TEST_URL`，完成迁移和两项测试后执行 `docker compose ... down --volumes`。它不会启动、停止、清理默认 `postgres` 开发服务或其持久化卷。

验收入口会先执行 Prisma migration，再单独执行 `npm run db:setup:workflow-checkpoints` 初始化 LangGraph Checkpointer 表；两个集成测试自身不再调用 `PostgresSaver.setup()`，只验证已初始化表上的跨实例恢复和租约行为。前一个测试验证实例 A 在 review 阶段崩溃后，独立实例 B 从同一 `threadId` 恢复。后一个测试会启动独立 Node worker，覆盖未过期租约抢占失败、过期接管 token 递增、续租和旧 token 拒写。2026-08-01 已通过 `npm run test:integration:postgres:wsl` 在 WSL 随机专用临时库完成该两类测试；这不等同于生产负载、队列、exactly-once 或多地域验证。

### PostgreSQL 部署初始化

`PostgresSaver.setup()` 会创建 LangGraph 的 checkpoint 表，但其依赖库不负责跨实例的初始化互斥。生产部署应在发布阶段、单独的迁移/初始化任务中执行一次：

```powershell
$env:DATABASE_URL = "postgresql://...部署数据库..."
npm run db:migrate:postgres
npm run db:setup:workflow-checkpoints
```

随后设置 `WORKFLOW_CHECKPOINT_BACKEND=postgres` 启动应用。生产环境默认不会在每个应用实例启动时调用 `setup()`；只有受控环境显式设置 `WORKFLOW_CHECKPOINT_AUTO_SETUP=true` 才会自动初始化。

**已实现，待远程验证**：CI 中的 `postgres-workflow-integration` job 会启动一次性的 PostgreSQL 16 service、应用 `prisma/postgres/migrations`，再运行两项集成测试。它使用 Runner 内的临时数据库，不接触任何开发或生产连接串；首次远程 job 成功后，才可将该环境的验收标记为“已验证”。

## 不消耗外部费用的本地门禁

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:coverage
npm run quality:rag:golden
npm run db:validate
npm run db:validate:postgres
```

`npm run quality:all` 仍是较宽的历史汇总门禁，其中包含 Playwright 和 production build；它不替代专用 PostgreSQL 测试，也不产生真实模型实验数据。

## P2：增量审批本地验收（已实现）

审批恢复载荷允许可选的 `taskPatch`。补丁只能修改既有任务的标题、描述、角色、依赖、工具和预估 Token；不能新增/删除任务或修改报告章节。服务端必须在持久化前将补丁应用于原始计划，并重新运行完整 Planner 校验。

审批记录必须保存规范化补丁、原计划 SHA-256 和修订计划 SHA-256。报告生成必须基于该补丁派生有效计划，并在指纹不一致时失败；原始 `PlanningArtifact.executionPlan` 不得被覆盖。`reject` 与非空任务补丁是语义冲突，必须被拒绝。

**已验证（本地）：**

```powershell
npx tsx --test src/lib/planner/incremental-approval.test.ts src/lib/workflow/product-graph.test.ts src/lib/report/report-service.test.ts
npm run db:migrate:sqlite
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

本轮聚焦测试验证未知任务、无效依赖图、任务补丁的指纹和预估重算、审批恢复不重跑已完成节点，以及报告中的 `human_task_edit` 来源。SQLite migration 已实测应用；PostgreSQL migration、真实模型工作流和生产用户体验仍为**待实测**。

### 人工 Golden Set 私有数据边界

人工标注模板、项目文档冻结快照、编译产物和成本授权关联的消融运行计划只允许写入仓库内的 `local-only/` 目录。路径校验使用规范化后的相对路径，而非字符串包含判断，因此 `local-only-copy/`、仓库外目录和通过 `..` 逃逸的路径都会被拒绝。该约束用于避免真实来源文本、标注人信息、未发布评测集或冻结成本计划被误写入可提交目录；它不产生任何 RAG 或 Agent 质量指标。

默认文档冻结入口：

```bash
npm run quality:rag:human-golden:freeze-docs -- --output local-only/rag-human-golden-docs-freeze
npm run quality:rag:human-golden:prepare -- --corpus local-only/rag-human-golden-docs-freeze/corpus.json --sources local-only/rag-human-golden-docs-freeze/sources.json --output local-only/rag-human-golden-docs-annotation
npm run quality:rag:human-golden:status -- --input local-only/rag-human-golden-docs-annotation
```

该流程只生成来源和 chunk 清单，`cases.tsv` 必须由人工填写并由不同人员复核；`status` 只汇报标注进度、行级错误和就绪性，不计算 Recall@5、MRR 或 NDCG。空 `cases.tsv` 在 build 阶段必须失败，不能被当作人工 Golden Set。

### 最近一次本地执行记录（2026-08-01）

- **历史已验证（2026-08-01，OTLP 测试纳入前）**：`npm run lint`、`npm run test:unit`（158 passed, 0 failed, 0 skipped）、`npm run quality:rag:golden`、`npm run db:validate`、`npm run db:validate:postgres` 和 `npm run typecheck` 均通过。Golden Gate 在 12 条冻结 fixture 上同时校验 clean `Recall@1`、shared-noise `Recall@5` 和 `NDCG@10`；人工 Golden Set 的来源、独立审核和 100-case 就绪性检查、RRF 网格候选的固定选择规则，以及同进程 OTel 嵌套 span 上下文也有单测。以上均不构成生产知识库质量结论。
- **已实现 / 已验证（2026-08-01）**：Node.js 运行时在显式配置 `AGENTFORGE_OTLP_TRACES_ENDPOINT` 时注册 OTLP/HTTP Exporter；默认不注册 SDK、不发送网络请求。endpoint 仅接受 HTTP(S)，服务和版本资源属性只读取安全环境变量。`npm run test:unit` 已将 OTLP 配置测试纳入标准入口并通过 161/161，`npm run typecheck`、`npm run lint` 和 27 页生产构建也通过。尚未连接真实 Collector，因此不能声称外部 trace 已被接收。
- **已验证**：人工 Golden Set 模板可创建到 `local-only/`，近似的非私有目录会被拒绝；该验证仅覆盖私有输出边界，不代表已获得人工标注数据。
- **已验证（2026-08-02）**：`quality:rag:human-golden:freeze-docs` 默认冻结8份当前项目 Markdown 文档，生成193个 chunk，并覆盖1个 `api-reference` 来源；随后 `quality:rag:human-golden:prepare` 生成待标注 TSV 包。`quality:rag:human-golden:status` 对该包返回 `not_ready`：8 个 source、193 个 chunk、0 个人工 case、0 个有效 case，且低于100条最小门槛；补齐 build 元数据后，空 `cases.tsv` 被 `HUMAN_GOLDEN_TSV_NO_RECORDS: cases.tsv` 拒绝。这证明工具链不会把未标注数据伪装成评测结果。
- **已验证**：消融计划 CLI 可在 `local-only/` 生成冻结计划，向公开目录输出会被拒绝；该验证只保护授权与审计资产位置，不替代真实模型运行。
- **已实现 / 已验证**：授权模板 CLI 可在 `local-only/` 生成绑定当前计划哈希、案例哈希和协议储备的 schema v2 `pending` 文件；模板不读取凭证、不调用 Provider，且 `pending` 状态会被授权预检拒绝。它不构成真实外部费用审批。
- **已验证**：以 5 次重复生成的 480 条四臂消融运行计划完成 preflight（`executionOrderSeed=20260801`）；输出为 `preflight_only`，未读取模型环境变量、未调用 Provider。按当前冻结调用拓扑、每调用 16,000 个本地估算输入 token 和 12,000 个输出 token 计算，协议储备为单条最高 `$1.0902`、完整计划 `$329.904`；实际外部支出为 `$0`。冻结计划保存在被 Git 忽略的 `local-only/ablation/run-plan.json`。
- **已验证（WSL 专用临时库）**：`npm run test:integration:postgres:wsl` 已在本次工作区复验中使用随机角色和数据库 `agentforge_p0_wsl_5ab6c36a9436f370`，应用三条 migration 后通过 checkpoint 恢复与多进程 lease/Fencing 两项集成测试，随后执行 `DROP DATABASE`、`DROP ROLE` 并清理 Linux staging 目录。`postgres-workflow-integration` CI job 尚未获得远程 Runner 回传，Docker Compose 也是待补充的独立环境证据；本机 Docker CLI 与 GitHub CLI 均不可用，不能把环境门禁当作验收通过。
- **已验证**：`npm run db:setup:workflow-checkpoints` 会拒绝空或非 PostgreSQL 的 `DATABASE_URL`，因此不会误把 SQLite 开发配置当作 Checkpoint 初始化目标；真实 PostgreSQL 建表仍待专用数据库实测。
- **已实现，待 Docker 环境复验**：`npm run test:integration:postgres:local` 使用独立 `postgres-test` Compose profile 自动完成专用库启动、迁移、跨实例 Checkpointer 测试、多进程租约/Fencing 测试及清理。本机当前未安装 Docker；其缺失门禁已验证。新增的无数据库回归测试还确认：续租被 fencing 拒绝后，工作流不会把执行结果误报为成功。
- **已验证（完整本地门禁）**：`npm run quality:all` 已在当前工作区通过：158 个单测、24 个核心 E2E、1 个 Session 隔离 E2E、TypeScript、ESLint 和 27 页生产构建均成功。Playwright 现在使用并在结束后清理专用 `.next-e2e` 目录，避免 `next dev` 生成物污染后续 TypeScript 检查；这只是测试构建产物隔离，不增加真实模型或生产环境证据。
- **已验证（覆盖率门禁基线）**：Node 原生覆盖率命令以 `src/lib/**` 为唯一统计范围执行全量单元测试，实测行覆盖 `92.25%`、分支 `87.70%`、函数 `89.06%`。`npm run test:coverage` 现对三项分别施加 `>=80%` 阻断阈值，并已加入 CI；该指标不包含前端页面、API Route、脚本、E2E 或真实 Provider 调用，不能被表述为全仓或生产覆盖率。
- **已验证（本轮复验）**：跨三次账号切换并覆盖规划、评审、报告、工作流、文档和 Tool 隔离的 Session E2E 实际耗时约 26 秒，原全局 30 秒 Playwright 超时可能在用例末段提前中断。因此该用例已显式设置 120 秒预算，所有隔离断言保持不变；调整后 `npm run quality:all` 再次全绿。这是测试预算与验收范围一致性的修正，不代表系统响应时间目标、真实模型性能或生产容量结论。
- **已验证（2026-08-01 工程收口历史快照）**：当时工作区的 `npm run quality:all` 已通过确定性 RAG 基线/G​​olden、盲评 synthetic dry-run、`171/171` 单测、`24/24` 核心 E2E、`1/1` Session 隔离 E2E、类型检查、ESLint 与 27 页 production build。新增 `npm run test:coverage` 对 `src/lib/**` 的行/分支/函数分别应用 `>=80%` 门禁，实测为 `92.25% / 87.70% / 89.06%`。该范围不包含 API Route、UI、脚本、E2E 或真实 Provider，且远程 GitHub Actions 回传仍为待实测。2026-08-02 的当前完整门禁数字见 [当前开发状态](./2026-08-01 - current-development-status - 当前开发状态.md)。

## 报告规则

所有 V2 文档和面试表述都必须使用以下标签：

- **已实现**：代码或协议已进入当前工作区；
- **已验证**：对应范围的可复现测试已经通过；
- **待实测**：需要真实模型、专用 PostgreSQL 或人工标注才能验证；
- **目标设计**：尚未实现的未来方案。

不得以工具链、fixture、跳过的集成测试或预设数字，替代真实质量或生产环境结论。

## 2026-08-02 RAG 人工 Golden Set 标注工作清单

### 已实现

- 新增 `quality:rag:human-golden:worklist`，从冻结的 `corpus.json` 和 `sources.json` 生成人工标注任务清单，并且只允许写入仓库内 `local-only/`。
- 输出 `annotation-worklist.tsv`、`summary.json` 和 `README.md`；不会写入 `cases.tsv`，也不会生成 query、相关性标签、Recall@5、MRR 或 NDCG。
- 新增 `quality:rag:human-golden:worklist-to-cases`，只提升已人工填写并由独立 reviewer 批准的 worklist 行；转换时校验 `queryType`、`relevantChunksJson`、标注/复核时间、独立 reviewer、重复 case/query，以及所选 chunk 的相关性下限。

### 已验证

```powershell
npm run quality:rag:human-golden:worklist -- --corpus local-only/rag-human-golden-docs-freeze/corpus.json --sources local-only/rag-human-golden-docs-freeze/sources.json --output local-only/rag-human-golden-worklist --target-case-count 100 --seed 20260802
npm run quality:rag:human-golden:status -- --input local-only/rag-human-golden-docs-annotation
```

- 工作清单生成 100 条任务，来源 8 个，chunk 193 个；覆盖 `technical` 27、`business` 43、`api-reference` 13、`runbook` 17，已覆盖必需的 `technical`、`business`、`api-reference` 类型。
- 工作清单表头和首行均为 19 列，人工字段列保持空白；转换脚本的单测覆盖 approved 行转换、空白/拒绝行跳过、独立 reviewer、所选 chunk 相关性和缺失 queryType。
- `status` 对当前标注包仍返回 `not_ready`：`caseRowCount=0`、`validCaseCount=0`，问题为 `cases.tsv has no human-annotated query rows` 和低于 100 条最小门槛。

### 待人工

- 负责人需要根据 worklist 填写至少 100 条人工 query、相关 chunk、标签和独立 reviewer；完成前禁止计算或宣称真实 RAG Recall@5、MRR 或 NDCG。
