# V2 可验证性执行方案

> 日期：2026-08-05
> 定位路线：**B —— 让多 Agent 输出可验证、可审计、可恢复**
> 状态：方案已定，待授权执行

---

## 一、路线选择

放弃 A（"AgentForge 让 AI 生成更好的网站"），采用 B。

| | A | B |
|---|---|---|
| 主张 | 生成的网站更好 | 输出可验证、可审计、可恢复 |
| 证明成本 | 20 case × 2 评分者 = 40 次人工盲评 | 门禁 + 故障注入 + 幂等测试 |
| 结论确定性 | 低（可能无统计显著性） | 高（机制正确性可确定性验证） |
| 基础设施 | 需从零积累人工评分 | 大部分已建成 |

B 的核心资产是 preflight 漂移门禁：`blockingReasons` 非空即 `ready:false` 且 `process.exitCode = 1`，校验 promptVersion / adapterVersion / parameters / 包目录绑定 / runId 新鲜度 / 报告与 manifest 的 SHA-256。MetaGPT 与 ChatDev 均无此机制。

B 的完整交付定义：**可恢复、可审计、可验证三个属性各有 CI 门禁保护，且每个对外数字都带 provenance。**

---

## 二、已核实的当前状态

### 已跑出的真实数据（零预算，无 API Key）

| 指标 | 结果 | 效力边界 |
|---|---|---|
| fault-recovery | 150/150，恢复率 100%（3 场景 × 50 试验） | 机制级有效 |
| tool-reliability | sampleSize 2，成功率 0.5，replayHitRate 0.5 | 样本过小 |
| structured-output | firstPassCleanRate 0.857 | **测的是基线规划器，非模型** |
| evidence-support | 12/12，支持率 100% | **基线自造 finding 自引用，构造性自洽** |
| human-intervention | approvalGateTriggeredRate 0.857 | 机制级有效 |
| latency-and-cost | 全节点 averageMs = 0 | **无效** |

数据来源：`npm run test:e2e:core -- --keep-db`（26/26 通过）后将 `DATABASE_URL` 指向留存库运行 `quality:agent-metrics`。该路径由 `scripts/run-isolated-e2e.mjs:176` 预置并打印命令，无需新增代码。

### 核心缺陷：指标层给无效数据发"可信"证书

所有指标的 `limitation` 判据只有 `sampleSize === 0`，非零即置 `null`（含义为"此数可信"）。

而 `scripts/run-isolated-e2e.mjs` 的 `childEnv` 中 `PROVIDER_TIMEOUT_MS: "300"` 且无任何 API Key。`src/lib/planner/planner-service.ts:46,53` 的分支为 `input.generate ? generateStructuredOutput(...) : analyzeRequirementBaseline(...)`——缺凭证即走基线确定性规划器（`src/lib/llm/router.ts:80-83` 明确"缺凭证必须失败，不能用模拟回复伪装成成功"）。

由此产生三个失真：

1. `structured-output-quality` 名义量模型 Zod 首过率，实际量基线规划器结构合法性
2. `evidence-support-rate` 100% 源于基线自造 finding 自引用
3. `scripts/agent-metrics/latency-and-cost.ts:24` 排序为 `(b.averageMs ?? 0) - (a.averageMs ?? 0)`，30 个节点全 0 时所有比较返回 0，排序退化为空操作，`nodeLatency[0]` 变为 Map 插入顺序首项，`:48` 将其写为 `bottleneckNodeKey`，`:55` 因 `nodes.length !== 0` 判定 `limitation: null`

即：**系统从全 0 数据中"定位"出瓶颈节点并宣布结论可信。**

另：token 均值 41 in / 26 out 来自 `router.ts:165-166` 的 `?? estimateTokens(...)` 回退估算，下游无字段可区分 provider 计量与本地估算。

### 根因

`.github/workflows/ci.yml` 已有 14 道门禁（依赖审计、密钥卫生、lint、typecheck、单测、覆盖率门禁 src/lib ≥ 80%、e2e core、e2e session、RAG Golden Set 回归、文档链接校验、生产构建，另一 job 专跑 PostgreSQL 迁移与 checkpoint 恢复验证）。

但覆盖率门禁只覆盖 `src/lib`，指标脚本住在 `scripts/`——门禁之外，`scripts/agent-metrics/` 零测试。且 `quality:fault-recovery` 与 `quality:agent-metrics` 均不在 CI 中。

**测量代码是仓库覆盖率最低的部分，而它产出的数字正是用于证明系统质量的数字。** 上述退化 bug 得以存活，根因在此。

---

## 三、执行阶段

### P0 · 提交现有 34 个未提交文件（5 分钟）

纯保护动作。`.gitignore:17` 含 `*.db`，e2e 库不会误提交。

前置已修：`docs/` 下由本轮创建的竞品分析文档原命名 `2026-08-05-competitive-analysis-...`（日期后缺空格）不符合 `verify-document-links` 的正则 `^(?:20\d{2}-\d{2}-\d{2}|旧) - [A-Za-z0-9][A-Za-z0-9-]* - .+\.md$`，已重命名，门禁复跑通过（56 份文档）。该门禁在 CI 中位于 `npm run build` 之前，若不修则提交即断流水线。

### P1 · 修指标层有效性模型 + 补测试（4-5 小时，不动 schema）

**① 修退化 bug。** `latency-and-cost.ts` 在延迟全相等时 `bottleneckNodeKey` 返回 `null` 并给出退化原因，不再从无序信息中提取结论。

**② 二元 `limitation` 改为显式声明范围三档：**

- `invalid` —— 零样本，或该项测量本身退化
- `mechanism-only` —— 有样本但来自基线/桩路径，机制级结论可用，模型行为结论不可用
- `full` —— 来自真实模型路径

关键取舍：脚本无法从数据本身可靠推断 provenance（此为 P3 待解问题）。故 P1 不假装自动侦测，而是引入 `--data-source=stub|real-model|mixed` 参数，**默认 `unknown` 并取最保守档**。宁可少声明，不可错声明。

**③ 先做可测性重构，再补测试。** 五个指标脚本形状相同：模块顶层 `import { prisma } from "../../src/lib/db"` + `main()` 直读 DB + `console.log` 输出。此形状无法单元测试，须先将纯计算抽为可注入数据的函数（如 `computeLatencyMetrics(nodes, usages)`），CLI 保持薄壳。

因此 P1 是**重构 + 补测试**，非单纯补测试，估算由 2-3 小时上修为 4-5 小时。

测试至少覆盖：全 0 延迟不产出瓶颈、零样本不产出比率、`unknown` provenance 强制降档。

附注：此形状本身即是退化 bug 得以存活的原因——脚本既在覆盖率门禁之外，又不可单元测试。

### P2 · 将 fault-recovery 与 agent-metrics 纳入 CI（30 分钟）

`quality:fault-recovery` 自带硬门禁（未全恢复即 `exitCode 1`）、用 stub 依赖、零 API Key、默认 30 试验约十余秒，CI 友好。

此步将"曾跑过一次 150/150"升级为"每次提交都验证恢复机制，回归即红"。同一份证据，说服力差一个量级。

### P3 · tokenSource 出处贯通（4-6 小时，需 migration）

已核实 `TokenUsage` 模型无 provenance 字段（仅 provider / model / inputTokens / outputTokens / costUsd / costCny）。

改动链：`src/lib/types.ts:66` 的 `LLMResult` 增 `tokenSource: "provider" | "estimated"` → `router.ts` 四个返回点按 `response.usage` 是否存在填值（`:165-166` 条件、`:208-209` 恒 provider、`:262-263` 条件、`:305-306` 恒 estimated）→ 双库 schema + migration → 落库 → 指标读取，替代 P1 的手动 flag。

完成后成本数字自证，"这些 token 是 provider 返回的还是估算的"有确定答案。

两份 schema 差异已查明，共 3 处且全部合理：generator 的 `output = "../generated/postgres"`、`provider` 值（sqlite / postgresql）、`leaseExpiresAt` 多一个 `@db.Timestamptz(3)`。两份刻意保持同构，迁移风险低于原估。现有 migration 数量：SQLite 17、Postgres 7。

**卡点：本机无 Docker。** 实测 `docker: command not found`，daemon 未运行。而 `scripts/run-postgres-workflow-integration.mjs` 依赖 `docker compose` 起 `postgres:16` 于 5433 端口（脚本内有 `commandAvailable("docker")` 检查）。

后果：P3 的 Postgres 半边**无法本地验证**。CI 中有独立 Postgres job 可验，但"迁移未经本地验证即落盘"与 B 路线的可验证原则冲突。三个处置选项待定：装 Docker、只落 SQLite 迁移、或 push 交由 CI 验证。

### P4 · 取真实模型样本（待预算决定）

两条独立通道，互不阻塞：

- **P4a Product/UI 单 case** —— 走 `spawn("claude")`（`claude-generator` 含 Windows `.cmd` 分支处理），用已登录 oauth，零额外预算，可立即启动
- **P4b 消融实验** —— 走 LongCat HTTP API，`src/lib/review/longcat-client.ts:9-17` 要求 `LONGCAT_API_KEY` / `LONGCAT_BASE_URL` / `LONGCAT_MODEL`，卡预算

**P4a 的效力边界（重要）：** 输入报告可由 e2e 的 `mode: "baseline"` 路径产出（已核实无需 API Key），但基线报告是模板生成而非模型生成。故 P4a 证明的是**链路通**，不是"AgentForge 更有效"。它满足"先跑通一个真实闭环"的要求，但效力结论须由模型生成的 ReportGroup 支撑，那需要 API Key。

**P4a 的调试尾巴无法估。** preflight 故意严格（SHA-256 + provider / model / promptVersion / adapterVersion / parameters 逐字段全等），首次跑真实 Claude 配置对不齐近乎必然，可能一轮过也可能六轮。两分支各 15 分钟超时，单次尝试最长 30 分钟。

---

## 四、明确不做

**动态编排、跨运行记忆、子 Agent 隔离** —— 降级为 V3 素材。理由：会使消融实验变为移动靶（边改系统边测系统）；固定 6 节点图是 243 个单测与幂等保证的地基；功能数量无法赢 MetaGPT（69.7K stars）与 deer-flow（79.3K stars）。

**OpenTelemetry** —— 从 P0 收回。P3 的 tokenSource 才是压力面数字的真正前置；OTel 是更完整的可观测性，但非当前瓶颈。

---

## 五、排序逻辑与 24 小时可行性

P0 → P1 → P2 → P3 → P4。**先修尺子，再量东西。**

顺序倒置则 P4 花掉的真实预算会被一把不可信的尺子浪费——当前五个 `limitation: null` 即为此种浪费的成因。

### 工时估算

| 阶段 | 工时 | 外部依赖 |
|---|---|---|
| P0 提交 | 5 分钟 | 无 |
| P1 可测性重构 + 有效性模型 + 测试 | 4-5 小时 | 无 |
| P2 纳入 CI | 30 分钟 | 无 |
| P3 tokenSource 贯通 | 4-6 小时 | **卡 Docker** |
| P4a Product/UI 单 case | 3-5 小时（方差大） | 无（用已登录 oauth） |
| P4b 消融实验 | —— | **卡 LongCat 预算** |

验证周期须单独计入：本地跑一遍 CI 等价校验（lint + typecheck + 单测 + 覆盖率 + e2e core + e2e session + RAG golden + 文档门禁 + build）约 8-15 分钟，P1 / P2 / P3 各需数轮，合计 1-1.5 小时。

累计：**P0+P1+P2 ≈ 6-7 小时**；加 P3 ≈ 11-13 小时；加 P4a ≈ 15-18 小时（乐观值）。

### 结论

| 24 小时的含义 | 可完成范围 |
|---|---|
| 连续工作 24 小时 | P0-P4a 可塞入，有余量 |
| 自然日（含睡眠与审批等待） | P0-P3 合适；P4a 不应排入 |

**建议将 24 小时交付定义为 P0+P1+P2。**

理由：这三步交付一个完整自洽、可对外陈述的成果——带出处标记与有效性分档的指标层 + 测试保护 + 恢复机制进 CI 强制门禁。零 API 成本、不依赖 Docker、不依赖 LongCat 预算，无任何外部阻塞。

P3 与 P4 各自带外部依赖，塞入同一 24 小时会使整体变为"部分完成"，弱于"P0-P2 全部完成并验证"。

估算风险：本轮对话中共有 5 条结论因未核实而出错（见第七节），每次纠错成本 20-40 分钟。24 小时预算内此项不可忽略。

---

## 六、待定事项

1. **P0 提交目标分支** —— 新分支或 main。建议新分支（34 个文件跨 README / 脚本 / API / 测试 / examples，改动面大）。
2. **P4 Product/UI 单 case 是否即刻启动** —— 零预算，与 P1-P3 并行不冲突。消融实验须待 LongCat 预算确认。

---

## 七、本轮撤回的错误结论

记录于此以免重复排查。

| 错误结论 | 实际情况 |
|---|---|
| `longcat-client.ts` 丢弃 usage 数据，需修 | 文件仅 66 行且正确：`:54-60` 累加 provider 返回 token 并计成本，`:42-45` reserve-before、`:60` commit-after 双重预算门禁。原判断基于一次损坏的读取输出 |
| 可用已登录 Claude CLI 绕过消融实验预算 | 消融走 LongCat HTTP API，与 Claude CLI 是两条独立付费通道，无法绕过 |
| `ToolInvocation.replayed` 待 migration + code fix | 已完成：双库 schema（`prisma/schema.prisma:388`、`prisma/postgres/schema.prisma:391`）、`tool-service.ts:33-34` 标记、`tool-reliability.ts:32` 计算 replayHitRate、`e2e/core.spec.ts:561` 有断言 |
| CI/CD 质量门控待建 | 已有 14 道门禁，缺口仅在 fault-recovery 与 agent-metrics 未纳入 |
| 将 fault-recovery trials 从 10 提到 50 可增强证据 | 该测试为确定性重放（故障恒在首次调用注入），50 次是同一断言重复 50 遍，仅排除 threadId 相关状态泄漏，不提供统计功效。脚本自身 `limitation` 已注明 "not chaotic random-timing crash testing" |

---

*配合 `2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md`、`2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md`、`2026-08-05 - competitive-analysis-and-v2-improvements - 竞品分析与V2改进方向.md` 使用*
