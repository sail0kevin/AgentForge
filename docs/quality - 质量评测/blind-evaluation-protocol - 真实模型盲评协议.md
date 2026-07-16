# P2-4 真实模型盲评实验协议
<!-- 文件名：blind-evaluation-protocol - 真实模型盲评协议 -->
<!-- 所属目录：quality - 质量评测 -->

更新时间：2026-07-15（Asia/Shanghai）  
状态：工具链已实现；尚未收集真实模型和人工评分结果。

## 1. 这项实验要回答什么

要比较的不是“谁写得看起来更长”，而是在同一批需求下，不同协作方式能否让开发报告更完整、更可执行、需要更少人工修订。实验只比较以下五种预先固定的变体：

| 代号 | 变体 |
|---|---|
| A | 单 Agent |
| B | 双候选，但不交叉评审 |
| C | 双候选 + 同一 RAG 快照 |
| D | 双候选 + RAG + Reviewer/Evaluator |
| E | D + 人工裁决 |

每个案例必须恰好运行五次，每个变体一次。五次运行使用相同的需求文本、相同模型与参数（除非变体本身需要增加角色）、相同知识快照和相同预算上限。不要在看到结果后替换困难案例。`caseId` 应使用不含项目主题的固定匿名编号，例如 `case-01`，不应使用 `admin-portal` 这类容易在正文中暴露身份的名称。

## 2. 最小样本与人员规则

预注册的最低门槛为 **12 个案例**、每份匿名报告由 **2 名独立评分者**评分；建议使用 3 名评分者。案例至少覆盖企业网站、运营后台和学习规划三类需求，并包含不同复杂度和不完整需求。

评分者只能拿到匿名报告包，不得看到变体、原始案例 ID、运行耗时、Token、成本或其他评分者的意见。执行人保管解盲表，直到所有评分表冻结。若评分者参与了某份报告的编写或修订，该评分者不能评该报告。

评分包含不可逆的 `packetId`。每位评分者必须把该值原样写入评分表；汇总工具会拒绝来自另一个评分包的表，避免两个实验或两次发卷被错误混合。

## 3. 评分表与统计口径

每份报告按 1–5 分评分：

| 指标 | 1 分 | 3 分 | 5 分 |
|---|---|---|---|
| 需求覆盖 | 漏掉关键目标 | 覆盖主目标但有缺口 | 目标、边界和验收条件清楚 |
| 技术可行性 | 关键做法无法落地 | 大体可行但依赖未说清 | 依赖、风险和实现顺序可执行 |
| 可测试性 | 几乎不能验收 | 有部分测试想法 | 有明确验收、测试路径和失败处理 |
| 证据正确性 | 无法追溯或明显错误 | 有来源但关联不完整 | 关键主张可追溯且不过度推断 |
| 易读性 | 难以理解或行动 | 基本能读懂 | 小白可理解、工程人员可执行 |

同时记录人工从收到报告到可接受交付版所花的 **修订分钟数**（包含核实、补写和删改，不包含等待模型的时间）。系统自动记录延迟、输入/输出 Token 与成本。汇总时按变体报告均值、相对单 Agent 的差值、案例数与评分数；保留每份原始评分和协议偏差说明。

## 4. 可复现执行流程

1. 在实验前冻结案例清单、模型版本/参数、RAG 知识快照、预算、评分者名单和本协议版本，并为案例清单计算 SHA-256。
2. 将 12×5 份真实输出及运行元数据写入 `local-only/blind-evaluation/input.json`。顶层 `metadata` 必须包括：带时区的 `protocolFrozenAt`、`caseManifestSha256`、`model.provider/model/promptVersion/parameters`、`knowledgeSnapshot`（RAG 与交叉评审变体不可为空，含来源集、版本和 SHA-256）以及每次运行的 Token/费用上限。每条运行必须有 `caseId`、`variant`、`runId`、报告正文、延迟、输入/输出 Token 和成本。
3. 生成评分包与私有解盲映射：

```bash
npm run quality:blind:prepare -- --input local-only/blind-evaluation/input.json --packet local-only/blind-evaluation/packet.json --reveal local-only/blind-evaluation/reveal.json --seed study-2026-01
```

4. 工具默认拒绝正文或标题中包含 `caseId` 或变体代号的材料；应先清理泄露内容。只有在记录了原因的协议偏差下，才能显式传入 `--allow-identity-leakage`。只向评分者发 `packet.json`。每位评分者提交自己的 JSON 评分表，且必须写入 `schemaVersion: 1`、`studyId`、`packetId`、`raterId` 和 `scores`；每条 score 包含 `blindId`、五项 1–5 分、`humanRevisionMinutes` 和可选评论，并且必须对全部匿名条目恰好评分一次。
5. 全部评分冻结后才使用解盲表汇总：

```bash
npm run quality:blind:analyze -- --reveal local-only/blind-evaluation/reveal.json --scores local-only/blind-evaluation/rater-a.json,local-only/blind-evaluation/rater-b.json --output docs/quality/results/2026-xx-study.md
```

6. 复核输出中的案例数、评分人数、漏评、疑似在报告中泄露变体名称的警告，以及任何偏离协议的情况。仅将已解盲汇总和脱敏方法说明提交到 `docs/quality/results/`。

## 5. 结论边界

工具会拒绝缺少变体、缺少 RAG 快照、重复运行 ID、重复评分者、错误评分包和漏评评分表；案例数或独立评分者少于预注册门槛时，结果会明确标记为“不可用于质量优势声明”。即便达到门槛，也只能报告该模型、该知识快照和该案例集下的描述性结果；应同时公布原始分数、成本、协议偏差和不确定性，不能笼统宣称“多 Agent 必然更好”。

当前单元测试验证的是匿名化、完整性校验和解盲汇总流程本身，**不是**真实模型质量结论。
