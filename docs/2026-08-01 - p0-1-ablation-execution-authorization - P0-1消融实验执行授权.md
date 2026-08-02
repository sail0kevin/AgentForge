# P0-1 真实消融实验授权单

> 状态：待负责人填写并确认。本文不是实验结果，不能用于质量结论。
>
> 对应协议：`docs/2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md` 的 P0-1；冻结计划：`local-only/ablation/run-plan.json`。

## 可执行授权文件

如需先生成一份与当前冻结计划绑定的待填写文件，可使用授权模板生成器：

```powershell
npm run quality:ablation:authorization-template -- `
  --plan local-only/ablation/run-plan.json `
  --output local-only/ablation/execution-authorization.v2.template.json `
  --model LongCat-2.0 `
  --temperature 0.3 `
  --planner-prompt-version "<冻结 Planner Prompt 版本>" `
  --review-prompt-version "<冻结 Review Prompt 版本>" `
  --rag-snapshot "<冻结 RAG 快照>"
```

该命令只写入 `local-only/`，自动绑定案例清单哈希、规范化运行计划哈希和协议储备，生成的文件状态为
`pending`。它不是负责人审批，也不会读取 `.env`、Provider 凭证或调用模型；负责人完成字段填写并确认预算后，
才可以将其转换为符合 schema v2 的审批记录。`pending` 文件必须被授权预检拒绝，不能直接执行。

**目标设计已经落地为执行门禁：**真实运行除了 `--execute --confirm-external-costs`，还必须传入
`--authorization-file <local-only/*.json>`。文件不保存 API Key，但会冻结并逐项绑定负责人、授权时间、
Provider、模型、温度、Prompt/RAG 版本、计划哈希、预算、原始输出路径和 ledger 路径；命令行任一值与文件
不一致都会在读取模型环境变量前失败。

负责人确认后，在 Git 忽略的 `local-only/` 中创建如下 JSON，替换所有尖括号值：

```json
{
  "schemaVersion": 2,
  "status": "approved",
  "approvedBy": "<负责人姓名或工号>",
  "approvedAt": "<ISO-8601 含时区时间>",
  "provider": "longcat-openai-compatible",
  "model": "<精确模型版本>",
  "temperature": <0 到 2>,
  "plannerPromptVersion": "<冻结版本>",
  "reviewPromptVersion": "<冻结版本>",
  "ragSnapshot": "<冻结快照>",
  "caseManifestSha256": "b90c3da00519ed3d90ac7845306cfc99be82eda6956a6f2d86834b0e7c1c161d",
  "runPlanSha256": "<由冻结计划的规范 JSON 计算的 SHA-256>",
  "maxEstimatedInputTokensPerCall": 16000,
  "maxOutputTokensPerCall": 12000,
  "pricingSnapshot": {
    "sourceUrl": "https://longcat.chat/platform/docs/pricing/long-cat-2.0",
    "retrievedAt": "2026-08-01T00:00:00+08:00",
    "inputUsdPerMillion": 0.75,
    "outputUsdPerMillion": 2.95,
    "inputTreatment": "uncached"
  },
  "maxCostUsdPerRun": <单条上限>,
  "maxTotalCostUsd": <总上限>,
  "rawOutputRoot": "local-only/ablation/raw",
  "ledgerPath": "local-only/ablation/result-ledger.json"
}
```

默认 `npm run quality:ablation:run` 仅用于不加载 `.env` 的 preflight。只有本授权文件完整、负责人明确同意外部费用后，才可使用 `npm run quality:ablation:run:env` 加载本机授权环境并传入 `--execute --confirm-external-costs`。

## 冻结对象

- 案例清单 SHA-256：`b90c3da00519ed3d90ac7845306cfc99be82eda6956a6f2d86834b0e7c1c161d`
- 实验协议：`ablation-v2`
- 运行矩阵：24 个案例 x 5 次重复 x 4 个实验臂 = 480 条运行
- 执行顺序种子：`20260801`
- 实验臂：`single_agent`、`dual_candidate_no_review`、`single_candidate_with_review`、`full_multi_agent`

`caseManifestSha256` 与 `runPlanSha256` 均为解析后规范 JSON 的 SHA-256，不是磁盘文件字节哈希。执行
`npm run quality:ablation:plan` 后，命令会直接输出两项可填入授权文件的 fingerprint；不要使用
`Get-FileHash` 的结果替代它们。

## 必填授权信息

请由负责人填写以下全部字段。任何字段为空时，只能执行 preflight，不得加 `--execute`。

| 字段 | 已确认值 |
|---|---|
| Provider | 待填写 |
| 精确模型版本 | 待填写 |
| 温度（0-2） | 待填写 |
| Planner Prompt 版本 | 待填写 |
| Review Prompt 版本 | 待填写 |
| RAG 快照标识 | 待填写 |
| 单次本地估算输入 token 上限 | 16000（协议默认，用于限制动态 prompt 增长；不是 Provider 精确 token 或账单硬上限，变更需重新授权） |
| 单次输出 token 上限 | 12000（协议默认，变更需重新授权） |
| LongCat 标准计费快照 | 输入 $0.75/1M、输出 $2.95/1M、按未缓存输入处理 |
| 单条运行成本上限（USD） | 待填写 |
| 总成本上限（USD，至少覆盖 480 条单条上限） | 待填写 |
| 原始输出私有目录（必须在 `local-only/`） | 待填写 |
| ledger 私有路径（必须在 `local-only/`） | 待填写 |
| 外部费用授权人及日期 | 待填写 |

## 执行前检查

1. 重新生成或核对冻结计划，确认案例哈希、4 个实验臂、480 条运行和种子未变化。
2. 在不加载 `.env` 的环境下运行 `npm run quality:ablation:authorization-preflight -- --plan local-only/ablation/run-plan.json --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" --authorization-file local-only/ablation/execution-authorization.json`，确认输出为 `authorization_preflight_passed`。
3. 验证原始输出目录与 ledger 路径均被 Git 忽略，且访问权限只覆盖评测负责人。
4. 确认 `LONGCAT_API_KEY`、`LONGCAT_BASE_URL`、`LONGCAT_MODEL` 是本次授权环境的凭证；脚本会拒绝命令行模型名与环境模型名不一致的情况。
5. 先运行 `npm run quality:ablation:budget -- --plan local-only/ablation/run-plan.json --manifest "docs/quality - 质量评测/lightweight-case-manifest.json"`。授权预检会按 LongCat-2.0 官方标准价、冻结调用拓扑以及每调用 `16,000` 本地估算输入 / `12,000` 输出 token 上限计算最坏情形协议储备。当前完整计划为 `$329.904`，单条最高为 `$1.0902`。其中 C/D 组已包含补充假设后第二次结构化分析的重试上限。
6. 确认总预算覆盖冻结计划的协议储备。输出上限由请求参数约束；输入 token 仅由本地字符估算限制动态 prompt 增长，不能替代 Provider 的精确 token 计量，也不能形成 Provider 账单硬上限。实际 token、Provider 重试、折扣和账单舍入仍必须在完成后以 ledger 与 Provider 账单交叉核对。
7. 确认 Provider 账单查询路径可用。若执行中断且 ledger 留有 `inFlightRunId`，必须先人工核账，不能直接续跑。

## 已知解释边界

- checklist 覆盖率与约束满足率只评价冻结评分点，不等价于技术正确性、可行性或人工偏好。
- 失败、超时、空输出必须记录为 `excluded` 并保留原因，不得补零或静默删除。
- 只有原始输出存在、路径未越出私有根目录、SHA-256 匹配且 ledger 完整时，才可运行统计报告。
- 统计报告产生前，不得把历史 `99.3% / 86.2%` 解释为任何节点的因果结论。
- **已实现：** schema v2 授权将定价快照、输出 token 上限、本地估算输入 token 上限、冻结计划和结果 ledger 元数据逐项绑定；真实执行仍必须提供 `--execute --confirm-external-costs --authorization-file`。
- **已验证（离线预算预检）：** 当前 schema v1、`$0.01/条、$5` 授权已经失效；schema v2 会在读取 `.env` 或 Provider 凭证前校验定价快照、本地估算输入/输出 token 上限和最坏情形协议储备。这说明旧授权不能安全启动完整冻结计划，不代表真实调用已经发生。
- **已验证（2026-08-01，模板重建）：** 当前 24 案例 x 5 轮 x 4 实验臂的 480 条冻结计划已重新生成 `pending` 模板，模板单条储备为 `$1.0902`、总协议储备为 `$329.904`；对应的 24 案例、5 轮回归测试已通过。模板仍处于 `pending`，没有读取 Provider 凭证、调用模型或产生外部费用。
- **目标设计：** 若 Provider 后续提供可预检且可强制执行的精确输入 token 或账单上限接口，才能把本地估算门禁升级为 Provider 级硬限制；当前实现不作此声明。
- **待实测：** 实际输入/输出 token、缓存命中、Provider 折扣和账单舍入只能在取得新的费用授权并完成真实运行后，以 ledger 和 Provider 账单交叉核对。
