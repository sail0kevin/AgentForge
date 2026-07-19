# 质量评测材料
<!-- 文件名：README - 质量评测说明 -->
<!-- 所属目录：quality - 质量评测 -->

更新时间：2026-07-19（Asia/Shanghai）

本目录保存可复核的离线评测协议、冻结案例和完成解盲后的脱敏汇总结论，不保存模型密钥、用户数据、真实运行原文、未解盲映射或个人求职材料。

## 当前材料

- [真实模型盲评协议](blind-evaluation-protocol - 真实模型盲评协议.md)：P2-4的采样、运行、匿名评分、解盲和结论边界。
- [冻结案例清单](case-manifest.json)：12个预注册需求案例，网站、管理后台和学习场景各4个。
- `results/`：只在真实运行、独立评分、解盲和复核全部完成后存放脱敏汇总；当前没有真实模型质量结果。
- `local-only/blind-evaluation/`：本地私有执行目录，不得提交；用于保存运行计划、真实输入、匿名包、私有解盲表和评分表。

## RAG 离线回归

### 固定夹具基线

```bash
npm run quality:rag:baseline
```

覆盖12类固定检索意图，分别运行无噪声 `k=1` 和共享噪声 `k=5`，输出Recall、MRR、无关结果率和引用完整率。2026-07-19实测两种场景的Recall、MRR和引用完整率均为1；共享噪声无关结果率为 `0.5862068965517241`。

这是一组确定性夹具，只证明检索和引用指标实现，不代表真实模型或生产语料质量。

### 仓库文档冒烟门禁

```bash
npm run quality:rag:repository
```

脚本读取：

- `README.md`
- `docs/current-status - 当前开发状态.md`

2026-07-19文档收口后的最终复跑生成31个带标题路径和真实行号来源的Chunk，6个检索意图6/6命中目标章节。该门禁使用TF-IDF和标题字符串校验，不是通用检索准确率，也不表示项目使用Embedding、RRF或向量数据库。

## 真实模型盲评工具链

> **真实实验暂缓提醒：** 下面的命令链已经可以完成合成演练，但当前实现仍有几项必须先加固的门禁：匿名评分包尚未携带冻结需求和验收重点；`prepare` 不会自动强制执行preflight；运行Token/费用尚未与冻结预算逐项比较；`protocolFrozenAt` 尚未与案例清单冻结时间强绑定；最低案例/评分者门槛仍可由输入降低；允许身份泄露时，偏差只输出到控制台而未持久化到汇总结果。在这些问题修复并补充测试前，不应启动可用于公开质量声明的真实评分实验。

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

每条运行必须包含caseId、variant、runId、title、reportMarkdown、延迟、输入/输出Token和成本；元数据必须冻结模型、参数、Prompt版本、知识快照和预算。完整最小结构如下。当前Schema允许输入者覆盖 `minimumCaseCount` 和 `minimumRaterCount`，因此真实实验前必须先把12案例、2评分者门槛改为不可降低的协议约束；仅在JSON中显式填写12和2还不足以形成不可绕过的声明门禁。

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

当前 `quality:blind:prepare` 不会自动调用该预检；两条命令之间仍可替换输入文件。真实实验前应在代码中将preflight与prepare合并为同一不可绕过的入口，而不是只依赖人工按顺序执行。

### 5. 生成匿名评分包与私有解盲映射

```bash
npm run quality:blind:prepare -- --input local-only/blind-evaluation/input.json --packet local-only/blind-evaluation/packet.json --reveal local-only/blind-evaluation/reveal.json --seed study-2026-01
```

只把 `packet.json` 提供给评分者；`reveal.json` 必须由执行人私有保存。当前packet只含匿名报告正文，不含冻结需求和验收重点，评分者无法仅凭packet可靠评价“需求覆盖度”；真实发卷前必须先修复packet契约。

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

2026-07-19实测输出：12案例、5变体、60项运行、2名合成评分者、`synthetic: true`、`modelCalled: false`。这只证明工具链连通和门槛校验，**不是**真实模型实验，不支持“多Agent质量提升”“幻觉下降”或“成本下降”等结论。

## 统一质量门禁

```bash
npm run quality:all
```

当前门禁依次运行固定夹具、仓库文档检索、盲评清单、运行计划、合成dry-run、72项单元测试、24项核心E2E、1项Session隔离E2E、TypeScript、ESLint和Production Build。2026-07-19完整运行退出码为0。

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
