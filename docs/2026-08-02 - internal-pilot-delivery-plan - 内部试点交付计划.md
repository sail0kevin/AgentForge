# AgentForge 内部试点交付计划

更新时间：2026-08-02（Asia/Shanghai）

本文把当前工作区能交付的范围、验收条件和不能承诺的能力固定下来。它是内部研发试点计划，不是生产上线承诺，也不替代真实 Provider、真实知识库和生产环境验收。

## 1. 试点定位

AgentForge 当前适合交付为“面向研发团队的需求到产品/UI实施报告 Web MVP”。它帮助产品经理、设计师、技术负责人和评审人把一段产品或网站需求整理为结构化计划，生成体验优先、视觉优先和工程优先三套实施报告，暴露风险与证据引用，并在关键冲突处暂停等待人工决策；报告可导出为下游 AI 编程 Agent 使用的 Prompt，真实网站运行后再回写验收证据。

## 2. 当前可交付能力

### 已实现

- 认证用户可以创建需求规划任务，并获得需求分析、补充问题、执行计划和报告产物。
- Planner、Reviewer、Evaluator、人工审批和 Reporter 已接入同一 LangGraph 工作流，支持 interrupt/resume。
- 报告包含版本、状态、章节、Finding、风险、来源引用和导出结果；增量审批会校验任务补丁并保存指纹。
- RAG 支持受用户隔离的文档、Chunk、引用溯源、TF-IDF，以及可选 embedding/RRF 路径。
- Code Review 和 Bug Diagnosis 已有受限输入的确定性场景基线，可作为流程演示和接口联调入口。
- SQLite 默认运行，PostgreSQL Checkpointer、迁移、租约续期和 fencing token 已实现；WSL 专用临时 PostgreSQL 验收已通过；本地 Docker 专用验收入口已串联 migration、Checkpoint、Lease/Fencing 与备份恢复演练，但当前主机 Docker CLI 不可用，仍是“已实现，待实测”。
- 置信度驱动干预、结构化候选差异披露、可选 OTLP 边界和本地质量门禁已实现。

### 已验证

- 本地单元测试、核心 E2E、Session 隔离 E2E、TypeScript、ESLint、生产构建和 `src/lib/**` 覆盖率门禁已有通过记录。
- RAG Golden Set v0 是 12 条 fixture 回归门禁；它只能证明固定样例没有回归。
- 人工 RAG Golden Set 工具链可从当前项目 Markdown 文档冻结来源和 chunk 清单，并生成待人工填写的 TSV 标注包；默认冻结8份文档得到193个 chunk，状态检查命令已验证当前标注包为 `not_ready`：0条人工 case、0条有效 case、低于100条最小门槛，且已覆盖1个 `api-reference` 来源；因此还没有 Recall@5、MRR、NDCG 或独立复核结果。
- Tier 1 证据绑定和 Tier 2 可选验证接口已有确定性测试；默认未配置 Tier 2 时不会伪造语义核验结论。
- 消融实验计划、授权绑定和预算预检已通过，但没有执行真实 Provider，实际外部支出为 `$0`。

## 3. 试点用户流程

1. 管理员配置认证、Provider、模型、预算和知识库数据范围。
2. 用户提交一条真实但脱敏的研发需求，必要时回答澄清问题。
3. 系统生成计划和双候选评审，汇总为体验优先、视觉优先和工程优先三套报告，用户检查证据、风险、冲突和干预信号。
4. 用户逐项批准或修改允许修改的计划任务。
5. Reporter 生成带版本、来源和下游交接说明的产品/UI实施报告，用户人工确认后导出给下游 AI 编程 Agent。
6. 试点负责人记录成功、失败、人工修改、耗时、token、费用和用户反馈，形成后续真实评估数据。

## 3.1 结构化反馈入口

### 已实现并已验证

终态工作流的工作流页面现在提供“试点反馈”表单，并通过认证 API 保存一份可修订反馈。反馈包括：

- 报告可用性：无需修改即可使用、修改后可用、当前不可用；
- 是否人工修改；标记人工修改时必须选择干预原因；
- 证据问题类型：无、缺少、不相关、错误、过期或其他；
- 主要失败分类：需求理解、计划质量、评审质量、报告质量、工作流可靠性、模型服务或其他；
- 备注，最多 2,000 个字符。

反馈只允许关联当前用户自己的终态工作流：`completed`、`partial`、`blocked`、`inconclusive` 或 `failed`。同一工作流重复提交使用 upsert 更新原记录，便于试点参与者在复盘后修正判断。跨用户查询和写入均按 `workflowId + userId` 隔离。

### 数据边界

反馈模型和接口不会保存 Prompt、原始模型输出、Provider 凭证或未经用户主动填写的原始需求副本。反馈字段存在只能证明“收集入口已实现”，不能证明报告可用性、用户满意度或业务收益已经得到验证。

### 试点负责人匿名汇总

**已实现**：试点负责人可在受控运维环境执行：

```bash
npm run pilot:feedback-summary
```

该命令只输出样本量、反馈类别分布、报告可用率、人工修改率、时间窗口和异常枚举计数。它不会输出工作流 ID、用户身份、需求、Prompt、原始模型输出、备注或凭证。需要保留汇总结果时，只能显式写入 Git 忽略的私有目录：

```bash
npm run pilot:feedback-summary -- --output=local-only/pilot-feedback/summary.json
```

汇总默认少于 20 条反馈时返回 `not_ready`；达到 20 条后也只是描述性试点数据，不能单独证明用户价值、多 Agent 优势或模型质量提升。2026-08-02 的本机开发库实际汇总结果为 `sampleSize: 0`，因此没有可报告的用户效果结论。

## 4. 验收条件

### 进入试点前

- 明确一名业务负责人、一名技术负责人和故障升级联系人。
- 使用脱敏需求和指定知识库快照；确认 Provider、模型、预算和数据保留策略。
- 在目标环境应用数据库迁移，完成 PostgreSQL 专用环境验收，并确认备份和恢复演练结果。
- 在应用实例启动前单独执行 `npm run db:setup:workflow-checkpoints`，完成 LangGraph Checkpointer DDL 初始化；不要依赖多实例应用启动时并发建表。
- 运行 `npm run pilot:readiness:production`、`npm run quality:all`、`npm run test:coverage` 和文档链接校验，保存输出和版本信息。预检只检查配置，不代替迁移、备份恢复或外部服务验收。

### 试点结束时

- 形成真实使用记录，而不是用 fixture 数字替代用户效果。
- 至少整理失败案例、人工干预原因、证据错误类型、延迟、token 和费用分布。
- 由试点负责人执行匿名反馈汇总，并保留样本量与数据窗口；样本不足时如实记录 `not_ready`，不得用小样本比例替代业务结论。
- 由业务负责人确认报告是否可用于内部评审；未确认的结果只能作为辅助草稿。
- 根据真实数据决定是否调整 Reviewer 拓扑、RAG 参数、干预阈值和成本策略。

## 5. 当前明确不能承诺

- 不能承诺多 Agent 相比单 Agent 已经带来质量提升；P0-1 真实消融实验尚未获得授权并执行。
- 不能承诺 Recall@5、语义蕴含准确率、置信度校准、成本下降或延迟目标；真实人工 Golden Set、Provider 和生产遥测数据仍不足。
- Code Review 不是通用代码扫描器、SAST、真实仓库分析器或自动修复器；Bug Diagnosis 不是已验证根因或自动修复系统。
- PostgreSQL WSL 验收不等于 Docker、远程 CI、生产负载、队列 exactly-once 或多地域验收。
- 当前交付对象是内部受控试点，不是面向不特定用户的 SaaS 生产服务。

## 6. 下一步优先级

1. 完成 P0-1 外部成本授权，按冻结计划执行真实消融实验并生成配对分析。
2. 在 Docker 或远程 CI 中补充 PostgreSQL 独立环境证据。
3. 建立真实双人复核 RAG Golden Set，先让 `quality:rag:human-golden:status` 达到 `ready`，再计算 Recall@5、MRR 和 NDCG@10。
4. 用试点数据校准 Tier 2 验证器、置信度干预和 `priorAssistantMessages` 截断策略。
5. 试点稳定后，再讨论队列、权限细化、审计保留和公开部署。
## 7. 2026-08-02 本地门禁记录

### 已验证

- `npm run quality:all` 已在当前工作区通过，且没有调用真实 Provider。
- 单元测试为 `193/193`；覆盖率门禁通过，`src/lib/**` 的行、分支、函数覆盖率分别为 `92.30%`、`87.62%`、`89.49%`。
- 核心 E2E `24/24`、Session 隔离 E2E `1/1`、TypeScript、ESLint、50 份 Markdown 文档命名与本地链接校验、Next.js 生产构建均通过。

### 7.1 部署与运维入口

目标环境的预检、迁移、Checkpoint 初始化、备份恢复、启动、停止和回滚步骤统一见：[内部试点部署与运维 Runbook](./2026-08-02 - pilot-operations-runbook - 内部试点部署运维Runbook.md)。本机 WSL 隔离备份恢复演练已经完成并单独记录；本地 Docker 验收入口已补齐备份恢复链路，但因当前主机缺少 Docker CLI 尚未执行；目标环境、真实备份存储、Docker/远程 CI 和真实试点结果仍标记为“待实测”，不能用本机门禁结果替代。

### 7.2 PostgreSQL 备份恢复证据

### 已实现并已验证

本机 WSL 临时 PostgreSQL 已完成一次随机隔离库备份恢复演练，实际执行命令为：

```powershell
$env:AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL="<isolated-test-db-url>"
$env:AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED="isolated-test-database"
npm run test:integration:postgres-backup-restore
```

演练结果：

- `pg_dump` custom-format 备份生成通过；
- 备份大小为 `72214` bytes；
- SHA-256 为 `953ffe497453dd40fd094dfb75c72ef4bf01db07643b98445dff32cd5f496ea5`；
- 隔离数据库 `pg_restore` 通过；
- 新 Saver / 新 Graph 从恢复库读取并继续已有 checkpoint，工作流完成；
- 恢复后的旧 fencing token 拒写，当前 fencing token 可写；
- 随机恢复库、临时备份文件和本次测试数据已清理。

### 待实测

以上证据只覆盖本机 WSL 临时 PostgreSQL，不覆盖目标环境连接、生产备份存储、Docker/远程 CI、真实数据规模、恢复时间目标或生产部署。进入内部试点前，仍需在目标环境按 Runbook 第 5 节重新生成并保存备份元数据、恢复输出和 Checkpoint/Lease 验收结果。

### 试点前仍须完成

- 在目标环境执行 `npm run pilot:readiness:production`，并完成 PostgreSQL 迁移和 `npm run db:setup:workflow-checkpoints`；本机开发配置不构成该证据。
- 完成目标环境数据库连接、备份和恢复演练，并补充 Docker 或远程 CI 的 PostgreSQL 独立环境验收；本机 WSL 演练不能替代这些证据。
- 在明确 Provider、模型版本、预算、数据保留策略和私有原始输出位置后，经负责人授权执行 P0-1 真实四臂消融实验。
- 用脱敏的真实试点任务和人工复核数据，验证报告可用性、人工干预、RAG、时延、token 与费用；fixture 门禁不能替代用户效果。
