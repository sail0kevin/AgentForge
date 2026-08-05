# AgentForge 项目交接报告（第三轮）

> 生成时间：2026-08-06 01:30 (Asia/Shanghai)
> 分支：`v2-verifiability`
> 当前 commit：见下方 git log

---

## 一、项目当前状态

### 消融实验（Ablation Study）

| 指标 | 值 |
|------|-----|
| 进度 | **25/288** 次运行 |
| 已完成 case | lw-case-01 到 lw-case-07（部分） |
| 已排除 | 1 次（Structured output 格式错误，非代码 bug） |
| 已花费 | ~$1.10 USD |
| 总预算 | $211.59 USD |
| 预计完成时间 | **~15-20 小时**（单进程） |
| 进程状态 | 正常运行中 |

### 关键修复

1. **`.env` 引号 bug 已修复** — LONGCAT_API_KEY / LONGCAT_BASE_URL / LONGCAT_MODEL 的值之前被双引号包裹，导致 API URL 变成 `"https://..."/chat/completions` 无效 URI。这是之前实验卡死的根本原因。
2. **账本 inFlight 标记** — 已清除卡住的 `lw-case-06-trial-1-full_multi_agent` 标记
3. **API 并发验证** — 已验证 LongCat API 支持 4 并发请求（全部返回 200）

### 实验速度分析

各臂平均耗时：
- single_agent: 1.3 min
- dual_candidate_no_review: 5.8 min
- single_candidate_with_review: 7.7 min
- full_multi_agent: 12.1 min

每个 case 平均 26.9 分钟（12 runs × 加权平均）。24 case × 3 trial = 72 case-trial × 4 variant = 288 runs。

---

## 二、并行加速方案（可选）

### 方案概述

将 24 个 case 分成 4 组（每组 6 case），每组独立进程运行，写入独立 ledger，最后合并。

**预计时间：从 ~15h 降到 ~4h**

### 已准备的文件

| 文件 | 说明 |
|------|------|
| `scripts/agent-ablation-partition-plan.ts` | 分区脚本（按 caseId 均匀分配） |
| `local-only/ablation/partition-0.json` ~ `partition-3.json` | 4 个分区运行计划（各 72 runs） |
| `local-only/ablation/authorization-partition-0.json` ~ `3.json` | 4 个授权模板（待审批） |

### 卡点：需要人工审批

协议要求每个分区的 `runPlanSha256` 必须与授权文件匹配。分区后 hash 变更，需要审批 4 个新授权文件（每个预算 ~$52.90）。

**审批步骤：**
1. 打开 `local-only/ablation/authorization-partition-{0,1,2,3}.json`
2. 将 `status` 从 `pending` 改为 `approved`
3. 填写 `approvedBy` 和 `approvedAt`
4. 运行 `scripts/agent-parallel-ablation-launcher.ps1`

### 合并脚本

`scripts/agent-ablation-merge-ledgers.ts` 可将 4 个分区 ledger 合并为单个结果文件。

---

## 三、项目文件结构关键路径

```
├── src/
│   ├── lib/review/
│   │   ├── ablation-run.ts          # 消融实验核心运行逻辑
│   │   ├── ablation-protocol.ts     # 运行计划生成与校验
│   │   ├── ablation-authorization.ts # 授权验证
│   │   ├── ablation-budget.ts       # 预算估算
│   │   ├── longcat-client.ts        # LongCat API 客户端（原生 fetch + AbortController）
│   │   ├── agent-comparison.ts      # 4 个实验臂实现
│   │   └── checklist-scoring.ts     # 自动评分
│   └── app/generated/               # Demo 站点
│       ├── attendance/page.tsx      # 企业考勤工作台
│       ├── atelier/page.tsx         # 数字艺术展览
│       └── nocturne/page.tsx        # 数字聆听室
├── scripts/
│   ├── agent-ablation-run.ts        # 消融实验入口脚本
│   ├── agent-ablation-plan.ts       # 运行计划生成
│   ├── agent-ablation-partition-plan.ts # 分区脚本（新）
│   └── agent-ablation-report.ts     # 结果报告生成
├── docs/
│   ├── 2026-08-06 - evidence-chain-and-evaluation-methodology - 证据链与评估方法.md
│   ├── 2026-08-05 - competitive-analysis - 竞品分析与V2改进方向.md
│   └── quality - 质量评测/
│       └── lightweight-case-manifest.json  # 24 个测试用例
└── local-only/ablation/
    ├── result-ledger.json           # 实验账本
    ├── run-plan.json                # 完整运行计划
    ├── authorization.json           # 当前授权文件
    ├── partition-0.json ~ 3.json    # 分区计划
    └── raw/                         # 原始输出文件
```

---

## 四、未完成的任务（需要人工或外部条件）

| 项目 | 卡在哪 |
|------|--------|
| 消融实验跑完 + 统计分析 | 进行中，剩 263 次，预计 ~15h |
| Product/UI 真实盲评 | 需要 20+ 案例 × 2 个人工评分者 |
| RAG 真实评测 | 需要 100+ 条人工标注的查询 |
| PostgreSQL 环境复验 | 需要 Docker |
| 性能/成本实测报告 | 依赖消融实验数据 |

---

## 五、如何检查实验状态

```powershell
cd "G:\projects\agent-learning\projects\Multi-Agent-Workspace"
$ledger = Get-Content "local-only\ablation\result-ledger.json" -Raw | ConvertFrom-Json
Write-Host "Completed: $($ledger.results.Count)/288"
Write-Host "inFlight: $($ledger.inFlightRunId)"
Write-Host "Cost: $([math]::Round(($ledger.results | Measure-Object costUsd -Sum).Sum,2)) USD"
```

---

## 六、Claude 继续执行的步骤

1. **监控消融实验** — 每 30 分钟检查一次 `result-ledger.json` 进度
2. **如果实验卡住** — 检查进程链是否存活（cmd → npm → tsx → node），必要时重启
3. **实验完成后** — 运行 `npm run quality:ablation:report` 生成统计报告
4. **推进其他改进方向** — P0 消融实验后是 PostgreSQL Checkpointer、RAG 评测

---

## 七、面试核心问答（基于当前项目状态）

**Q: 为什么选多 Agent 而不是单 Agent？**
A: 消融实验正在量化验证。初步数据显示 full_multi_agent 臂的 coverageRate 比 single_agent 高 X%（待统计）。

**Q: 如何保证 Agent 输出质量？**
A: 三级门控：Schema 校验 → 交叉评审 → Evaluator 决策。Revision 闭环只处理证据支持的发现。

**Q: 项目有什么实际产出？**
A: 3 个可运行 Demo 站点（考勤、艺术展览、聆听室），均基于 AgentForge 生成的 implementation-manifest 实现。

**Q: 项目局限性？**
A: 消融实验仍在进行；RAG 和盲评需要人工参与；PostgreSQL 复验需要 Docker 环境。
