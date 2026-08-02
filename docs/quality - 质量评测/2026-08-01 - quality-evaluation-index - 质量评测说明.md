# 质量评测材料
<!-- 文件名：README - 质量评测说明 -->
<!-- 所属目录：quality - 质量评测 -->

更新时间：2026-07-31（Asia/Shanghai）

本目录保存可复核的离线评测协议、冻结案例和完成解盲后的脱敏汇总结论，不保存模型密钥、用户数据、真实运行原文、未解盲映射或个人求职材料。

## 当前材料

## V2 多 Agent 消融实验

> **已实现（工具链）**：`src/lib/review/agent-comparison.ts` 提供四个冻结实验臂；`src/lib/review/ablation-protocol.ts` 生成完整运行矩阵；`src/lib/review/ablation-statistics.ts` 仅对同一案例、同一重复轮次的成功结果做配对 bootstrap。失败、超时、空输出必须被记录为排除项，不能记成零分或静默删除。

> **待实测（真实模型）**：尚未获得可用于结论的 V2 数据。旧的 24-case 关键词命中率仅为探索性覆盖观察，不代表技术正确性、方案质量或根因。

先冻结计划，不会调用任何模型或读取密钥：

```bash
npm run quality:ablation:plan -- --trials 5 --output local-only/ablation/run-plan.json
```

计划中的四个实验臂为：A `single_agent`、B `dual_candidate_no_review`、C `single_candidate_with_review`、D `full_multi_agent`。真实运行前必须由负责人确认 Provider、精确模型版本、prompt 版本、温度、每次 token/cost 限额、总预算与私有原始输出留存位置；运行后才可计算 `coverageRate`、约束满足率或其他已预注册指标的配对差值及 95% 区间。

默认 preflight 不会读取模型密钥或调用模型：

```powershell
npm run quality:ablation:run -- `
  --plan local-only/ablation/run-plan.json `
  --manifest "docs/quality - 质量评测/lightweight-case-manifest.json" `
  --ledger local-only/ablation/result-ledger.json `
  --raw-output-root local-only/ablation/raw `
  --max-cost-usd-per-run 0.01 `
  --max-total-cost-usd 5
```

**已验证（2026-07-31）**：以 5 次重复生成的 480 条冻结运行计划已完成上述 preflight，状态为 `preflight_only`；声明的成本上限为 `4.80 USD`，实际外部费用为 `0 USD`。该演练不构成真实模型质量数据。

只有负责人明确确认外部成本后，才可添加 `--execute --confirm-external-costs` 运行真实模型。真实 ledger 生成后，以下命令只读取台账并输出配对差、95% 区间和排除数，不会调用模型；它会强制审计每个完成结果的原始文件存在性、私有目录边界与 SHA-256 内容哈希，审计失败时不会输出统计结论：

```powershell
npm run quality:ablation:report -- `
  --plan local-only/ablation/run-plan.json `
  --ledger local-only/ablation/result-ledger.json
```

- [真实模型盲评协议](./2026-07-19 - blind-evaluation-protocol - 真实模型盲评协议.md)：P2-4的采样、运行、匿名评分、解盲和结论边界。
- [冻结案例清单](case-manifest.json)：12个预注册需求案例，网站、管理后台和学习场景各4个。
- `results/`：只在真实运行、独立评分、解盲和复核全部完成后存放脱敏汇总；当前没有真实模型质量结果。
- `local-only/blind-evaluation/`：本地私有执行目录，不得提交；用于保存运行计划、真实输入、匿名包、私有解盲表和评分表。

## RAG 离线回归

### 固定夹具基线

```bash
npm run quality:rag:baseline
```

覆盖12类固定检索意图，分别运行无噪声 `k=1`、共享噪声 `k=5` 和共享噪声 `k=10`，输出Recall、MRR、NDCG、无关结果率和引用完整率。2026-07-31实测三个场景的Recall、MRR、NDCG和引用完整率均为1；共享噪声 `k=5` 无关结果率为 `0.5862068965517241`，`k=10` 为 `0.6470588235294118`。

这是一组确定性夹具，只证明检索和引用指标实现，不代表真实模型或生产语料质量。

### Golden Set v0 回归门禁

```bash
npm run quality:rag:golden
```

**已实现并已验证（2026-07-31）**：门禁固定 12 条检索意图、12 个相关 chunk 和 4 个共享噪声 chunk，并由 SHA-256 清单绑定。它会拒绝 clean `Recall@1`、shared-noise `Recall@5`、`NDCG@10`、MRR、引用完整率下降，或无关结果率上升的改动；当前离线实测与冻结基线一致。

**范围限制**：Golden Set v0 是确定性回归保护，不是“100+ 人工标注生产语料”，也不能说明真实知识库的通用召回质量。扩大语料、人工标注与真实文档上的 NDCG@10 仍属于目标设计。

### 人工 Golden Set 数据契约

**已实现（工具链，2026-08-01）**：`src/lib/rag/human-golden-set.ts` 定义真实人工标注集的严格输入契约。它要求来源快照 SHA-256、来源/文档/chunk 的可追溯关系、唯一 query、至少一个 relevance >= 2 的相关 chunk，以及标注人与审核人相互独立且审核状态为 `approved`。校验命令默认还会检查是否达到 V2 真实检索对比的最低就绪边界：至少 100 条 case、至少两个独立版本化来源文档，并至少覆盖 `technical`、`business`、`api-reference` 三类来源：

```bash
npm run quality:rag:human-golden:validate -- path/to/reviewed-human-golden-set.json
```

输出中的 `eligibleForRetrievalEvaluation: false` 代表 JSON 契约合法但样本尚不足，不能用于真实 RAG 对比。早期小规模人工试标可显式降低阈值，但不得把它表述为 V2 生产级评测集：

```bash
npm run quality:rag:human-golden:validate -- path/to/pilot.json --minimum-case-count 10 --required-document-types technical,api-reference
```

命令只输出案例数、文档类别、query 类型、相关性等级和多来源案例等**数据质量统计**；它不调用模型、不执行检索，也不输出 Recall/MRR/NDCG。因此仓库没有附带伪造的“人工标注样本”。

**待实测（真实数据）**：建立至少 100 条、覆盖多来源真实文档且完成独立审核的标注 query 后，冻结 source snapshot，再以同一数据集比较 TF-IDF、embedding 和 RRF 的 Recall@5、MRR、NDCG@10。完成该对照前，不调整 RRF 参数，也不作生产 RAG 质量声明。

### 人工标注包生成与编译

**已实现（工具链，2026-08-01）**：为避免人工直接手写大型 JSON 时遗漏来源、chunk 或独立审核关系，项目提供 TSV 标注包。模板与编译产物强制放在被 Git 忽略的 `local-only/`，不会向仓库提交真实语料、query 或标注人信息。

**已实现（标注准备增强，2026-08-01）**：`quality:rag:human-golden:prepare` 可从冻结的 Chunk JSON 与人工确认的来源元数据 JSON 自动生成 `sources.tsv`、`chunks.tsv`、空的 `cases.tsv` 和 README。它计算每个 Chunk 的正文 SHA-256，校验每个 Chunk 都有明确的来源归属，并把来源/Chunk 清单快照哈希写入 README；它不会生成 query、相关性等级、标注人或审核人，因此不会把合成数据伪装成人工数据。

```powershell
npm run quality:rag:human-golden:prepare -- `
  --corpus local-only/rag-human-golden/corpus.json `
  --sources local-only/rag-human-golden/sources.json `
  --output local-only/rag-human-golden/2026-08-01-annotation-package
```

`corpus.json` 必须是冻结检索语料的 `Chunk[]`；`sources.json` 必须由项目负责人根据真实文档快照填写，至少包含 `sourceId`、`documentId`、`documentType`、`version`、`contentSha256` 和 `license`。此命令只完成数据准备，不能证明已经存在人工标注，也不会产生 Recall@5、MRR 或 NDCG；后续仍需人工填写 `cases.tsv`，再使用现有 `quality:rag:human-golden:build` 与 `validate` 命令。

```powershell
npm run quality:rag:human-golden:template -- local-only/rag-human-golden/pilot
```

填写生成的 `sources.tsv`、`chunks.tsv`、`cases.tsv` 后，用以下命令编译。编译器会根据来源与 chunk 清单生成 `sourceSnapshot.sha256`，再复用现有严格契约验证 document/chunk 对应关系、三级相关性、唯一 query、独立审核和审核时间顺序：

标注前应先冻结每份真实来源的版本、许可和正文 SHA-256，再从同一正文分块结果登记 chunk SHA-256。每条 query 至少标记一个 `relevance >= 2` 的可回答证据，`annotatedBy` 与 `reviewedBy` 必须是不同人员；不得使用模型生成的 query 或未复核标签填充 100-case 门槛。这样得到的是可审计的人工语料准备记录，不是检索质量结果。

```powershell
npm run quality:rag:human-golden:build -- `
  --input local-only/rag-human-golden/pilot `
  --output local-only/rag-human-golden/pilot/frozen.json `
  --dataset-id rag-human-golden-2026-08-pilot `
  --snapshot-id knowledge-2026-08-pilot `
  --frozen-at 2026-08-01T12:00:00+08:00

npm run quality:rag:human-golden:validate -- `
  local-only/rag-human-golden/pilot/frozen.json
```

**范围限制**：template/build/validate 都不调用模型、不运行检索、不创建人工标注内容。`eligibleForRetrievalEvaluation: true` 只说明数据规模和来源契约达到最低评测门槛；必须在冻结后的真实语料上实际运行检索评测，才能报告 Recall@5、MRR 或 NDCG@10。

### 冻结人工集检索对比入口

**已实现（工具链）**：`quality:rag:human-golden:comparison` 支持在同一份冻结人工集上对比 TF-IDF、Embedding 和 Hybrid RRF。人工集中的 `relevance` 使用 1/2/3 分级：`relevance >= 2` 才计为可回答证据，`relevance = 1` 不计入 Recall/MRR，并在无关结果率中按弱相关处理；NDCG 使用分级增益。该口径写入命令输出，不得与旧的二元 fixture 指标混用。

检索正文必须作为单独 JSON 语料文件提供，且每个 chunk 的 `id`、`documentId` 和正文 SHA-256 必须与人工集的 `chunks` 清单一致。命令还会输出人工集哈希、source snapshot、语料哈希、case/chunk 数量、`k`、RRF `k` 和 embedding 模型，保证结果可以绑定到数据快照：

```powershell
npm run quality:rag:human-golden:comparison -- `
  --dataset local-only/rag-human-golden/frozen.json `
  --corpus local-only/rag-human-golden/corpus.json `
  --strategies tfidf,embedding,hybrid `
  --k 5 `
  --rrf-k 60
```

**已实现（数据门禁）**：人工集未达到默认 100 cases、两份独立版本化 source 以及 technical/business/api-reference 来源要求时，命令只输出 `status: "not_ready"`，不输出检索指标；正文缺失、chunk 数量不一致、未知 chunk、文档归属不一致或内容哈希不一致时直接失败。当前仓库只有空的 `local-only` 标注模板，因此尚未产生真实人工语料的 Recall@5、MRR、NDCG@10 或 RRF 调参结论。

**目标设计（尚未完成）**：填写并双人审核真实人工集，冻结 source snapshot 和正文语料后，先记录 TF-IDF/Embedding/RRF 基线，再基于同一数据集进行 RRF `k` 网格实验；在基线形成前不得调整 RRF 参数，也不得用确定性 Golden Set v0 的结果代替真实人工集结果。

### 仓库文档冒烟门禁

```bash
npm run quality:rag:repository
```

脚本读取：

- `README.md`
- `docs/2026-08-01 - current-development-status - 当前开发状态.md`

2026-07-19文档收口后的最终复跑生成31个带标题路径和真实行号来源的Chunk，6个检索意图6/6命中目标章节。该门禁使用TF-IDF和标题字符串校验，不是通用检索准确率，也不表示项目使用Embedding、RRF或向量数据库。

## 真实模型盲评工具链

> **已实现（协议门禁，2026-07-31）：** `quality:blind:prepare` 已将输入 preflight 和匿名化绑定为同一入口。它强制比对 case manifest 哈希与冻结时间、60 条注册运行、每条运行的 input/output token 及成本上限，并将最少 12 案例 / 2 位独立评分者固定为不可降低的协议约束。匿名 packet 现在同时携带不含 caseId/variant 的冻结需求和验收重点；接受身份泄露例外时，blindId 偏差会写入私有 reveal 并进入最终脱敏汇总，且该研究不可获得 `eligible` 声明状态。

> **待实测（真实模型与人工评分）：** 合成 dry-run 只证明工具链与门禁连通。尚未运行真实模型、尚未取得独立评分表，也未产生任何可公开的质量比较结论。

### 1. 校验冻结案例清单

```bash
npm run quality:blind:manifest
```

校验12个案例、唯一caseId、三类各4个、协议版本与SHA-256。当前清单SHA-256：

```text
013e022c673b63cd178adae77b01ba0040d19059fcb7da0cd5ad1dc35bde4658
```

### 2. 生成确定性运行计划

```bash
npm run quality:blind:plan -- --output local-only/blind-evaluation/run-plan.json
```

生成12案例 × 5变体 = 60个唯一runId。不传 `--output` 时只向stdout输出摘要。

### 3. 收集真实模型结果

将60份真实报告和运行元数据写入：

```text
local-only/blind-evaluation/input.json
```

每条运行必须包含caseId、variant、runId、title、reportMarkdown、延迟、输入/输出Token和成本；元数据必须冻结模型、参数、Prompt版本、知识快照和预算。完整最小结构如下。`minimumCaseCount` 与 `minimumRaterCount` 必须分别为协议常量 `12` 和 `2`，任何降低都会被 `prepare` 拒绝；每条运行不得超过冻结的 token/cost 上限。

```json
{
  "schemaVersion": 1,
  "studyId": "agentforge-p2-4-2026-xx",
  "protocolVersion": "p2-4-v1",
  "minimumCaseCount": 12,
  "minimumRaterCount": 2,
  "metadata": {
    "protocolFrozenAt": "2026-07-19T12:00:00+08:00",
    "caseManifestSha256": "013e022c673b63cd178adae77b01ba0040d19059fcb7da0cd5ad1dc35bde4658",
    "model": {
      "provider": "provider-name",
      "model": "exact-model-version",
      "promptVersion": "prompt-v1",
      "parameters": { "temperature": 0 }
    },
    "knowledgeSnapshot": {
      "sourceSetId": "knowledge-set-id",
      "version": "snapshot-v1",
      "sha256": "填写64位SHA-256"
    },
    "budget": {
      "maxInputTokensPerRun": 12000,
      "maxOutputTokensPerRun": 6000,
      "maxCostUsdPerRun": 1
    }
  },
  "runs": [
    {
      "caseId": "case-01",
      "variant": "single_agent",
      "runId": "case-01-single-agent",
      "title": "不泄露案例和变体身份的报告标题",
      "reportMarkdown": "本报告基于冻结需求生成，明确说明目标、范围、技术方案、实施步骤、验收条件、失败处理、风险、假设、来源与未决事项，并为评分者提供足够完整且可核验的真实模型输出正文。",
      "latencyMs": 1000,
      "inputTokens": 1000,
      "outputTokens": 1000,
      "costUsd": 0.01
    }
  ]
}
```

示例只展示一个run对象；正式文件必须严格包含运行计划中的60项，variant和runId必须使用计划输出的实际值。

### 4. 匿名化前预检

```bash
npm run quality:blind:preflight -- --input local-only/blind-evaluation/input.json
```

核对协议版本、案例清单哈希、60项运行及全部caseId/variant/runId映射。

`quality:blind:preflight` 可用于人工检查输入摘要；真正的 `quality:blind:prepare` 会在内存中重新执行相同的计划、哈希、冻结时间与预算校验后才写出 packet/reveal，因此两条命令之间替换输入文件不会绕过门禁。

### 5. 生成匿名评分包与私有解盲映射

```bash
npm run quality:blind:prepare -- --input local-only/blind-evaluation/input.json --packet local-only/blind-evaluation/packet.json --reveal local-only/blind-evaluation/reveal.json --seed study-2026-01
```

只把 `packet.json` 提供给评分者；`reveal.json` 必须由执行人私有保存。packet 包含匿名报告、对应冻结需求与验收重点，但不包含 caseId、variant 或 reveal 映射，因此评分者可以评价“需求覆盖度”而不获得实验臂身份。

### 6. 为每名评分者生成独立模板

```bash
npm run quality:blind:score-template -- --packet local-only/blind-evaluation/packet.json --rater rater-a --output local-only/blind-evaluation/rater-a.json
npm run quality:blind:score-template -- --packet local-only/blind-evaluation/packet.json --rater rater-b --output local-only/blind-evaluation/rater-b.json
```

每份模板绑定同一packetId、唯一raterId和全部60个blindId。至少需要2名互相独立且未参与对应报告制作的真实评分者。

### 7. 解盲汇总

```bash
npm run quality:blind:analyze -- --reveal local-only/blind-evaluation/reveal.json --scores local-only/blind-evaluation/rater-a.json,local-only/blind-evaluation/rater-b.json --output docs/quality\ -\ 质量评测/results/2026-xx-study.md
```

只有完成真实运行、评分冻结、完整性检查和复核后，才能提交脱敏汇总结果。

### 8. 合成数据端到端演练

```bash
npm run quality:blind:dry-run
```

**已验证（2026-07-31）**：合成演练输出 12 案例、5 变体、60 项运行、2 名合成评分者、`synthetic: true`、`modelCalled: false`；相关单测还覆盖预算超限拒绝、降低最低门槛拒绝、评分包需求上下文、身份泄露偏差持久化及声明资格拒绝。这只证明工具链连通和协议门禁，**不是**真实模型实验，不支持“多Agent质量提升”“幻觉下降”或“成本下降”等结论。

## 统一质量门禁

```bash
npm run quality:all
```

当前门禁依次运行固定夹具、仓库文档检索、盲评清单、运行计划、合成 dry-run、单元测试、核心 E2E、Session 隔离 E2E、TypeScript、ESLint 和 Production Build。历史的测试数仅表示当时快照；以当前工作区重新运行的结果为准。

## 公开与私有材料边界

可以提交：

- 协议；
- 冻结案例清单；
- 已复核、已解盲、已脱敏的汇总报告；
- 不包含身份映射的复现说明。

不得提交：

- Provider密钥或环境变量；
- 真实运行原文；
- `reveal.json`；
- 未冻结评分表；
- 可识别评分者身份的信息；
- 尚未完成复核的中间统计；
- `local-only/` 下任何材料。
