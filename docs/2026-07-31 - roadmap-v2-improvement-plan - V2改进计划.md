# AgentForge V2 改进计划

> 文档版本：v2.1 | 更新日期：2026-07-31  
> 基于：5阶段路线图执行结果 + 完整面试问答复盘  
> 原始路线图：`docs/旧 - roadmap-resume-blueprint - 简历蓝图实现计划.md`

> 状态校正：本文创建时沿用了较早的“SQLite-only Checkpointer / TF-IDF-only RAG”描述。2026-07-30 开工前核对确认，PostgreSQL `PostgresSaver` 分支、独立 Prisma migration 和 Hybrid RAG 已在工作区实现；它们的跨实例生产化、分布式租约和大规模召回评测仍未完成。以下“已实现”和“目标设计”以本次校正为准。

---

## 背景与问题定位

阶段1-5已全部执行完毕。核心发现：

| 指标 | 单Agent基线 | 多Agent完整链路 |
|------|------------|----------------|
| 覆盖率 | 99.3% | 86.2% |
| 样本量 | 24条 | 24条 |

**多Agent未超越单Agent**，这是V2最核心的待解问题。该结果来自关键词 checklist 的探索性实验，且样本内存在模型波动；V2 的首要工作是建立能支持归因的实验协议，不预设 Reviewer 或任一节点就是根因。

---

## 改进方向一：多Agent未达预期——根因诊断
### 当前执行状态（2026-07-31）

- **已实现**：四组消融实验的统一编排入口（`single_agent`、`dual_candidate_no_review`、`single_candidate_with_review`、`full_multi_agent`），并用确定性测试验证各组 Agent 调用拓扑。B 组不会隐式选择候选方案；C/D 组的差异仅为候选数量。
- **已实现**：冻结运行矩阵、案例清单 SHA-256 绑定、按 `caseId + trial` 配对的统计工具，以及固定随机种子的 bootstrap 95% 置信区间计算。失败或无输出的运行会作为排除项保留，绝不补为零分。
- **待实测**：尚未调用真实模型，也尚未产生新的质量结论。既有 `99.3% / 86.2%` 仅是 24-case 关键词 checklist 的探索性观察，不能据此归因或宣称质量差异。

在确认 Provider、模型版本、温度、单次/总预算和原始输出保存策略后，先执行如下无网络步骤生成冻结运行计划：

```bash
npm run quality:ablation:plan -- --trials 5 --output local-only/ablation/run-plan.json
```

24 个冻结案例、5 次重复、4 个实验臂共生成 480 次计划运行；其中每一对比较都必须使用同一 `caseId + trial`。实际调用器必须把模型、prompt 版本、温度、token/cost 上限、开始时间、失败原因和每次原始得分写入本地私有目录后，才能输出配对均值差和区间。真实结果需另行复核，不能把工具链测试当成实验数据。

### 问题描述
当前多Agent（86.2%覆盖率）明显低于单Agent基线（99.3%）。根因尚未确认，需要系统性诊断。

### 改进措施

**1. 扩大有效观测规模（优先级：高）**
- 当前只有24条 case 的单轮探索性结果，统计置信度不足
- 目标：先冻结分层 case 与运行协议，再通过每个 case 的重复运行获得100+有效观测，并计算配对差值的95%置信区间
- 实施：优先人工复核和扩展 case，不把未审查的自动生成需求直接当作基准数据

**2. 消融实验设计**
设计4组对照实验，逐层排查根因：

| 实验组 | 配置 | 目的 |
|--------|------|------|
| A | 单Agent（当前基线） | 对照组 |
| B | 双Candidate无Review | 验证并行候选本身是否引入噪声 |
| C | 单Candidate + Review | 验证Reviewer是否过度否定 |
| D | 完整多Agent链路 | 当前配置 |

**3. Reviewer Prompt优化（消融结论之后实施）**
面试复盘发现：Reviewer被引导"挑刺"，可能导致过度保守。
- 当前prompt倾向："找出候选方案的所有问题"
- 改进方向：允许Reviewer输出"无重大问题"的诚实结论
- 添加规则：当两个候选方案高度一致时，允许直接通过，不强制制造差异

**4. Evaluator保守性诊断**
- 添加Evaluator决策日志，记录每次`needs_human`触发的原因
- 分析：是Evaluator标准过严，还是候选方案质量确实存在分歧？
- 考虑为`ReviewBudgetSchema`的`maxReviewRounds`增加动态调整逻辑

---

## 改进方向二：可靠性与并发控制生产化

### 问题描述
面试中被问及多实例部署时，当前代码仍缺少以下生产化能力（已如实承认）：
- 已有可选共享 Postgres Checkpointer；本文早期草案中的验证状态已被下文的 WSL 专用临时库验收结果更新
- 本段创建时尚无分布式租约/Fencing Token；当前实现与待实测边界见下文“改进措施”第 2 项
- 无后台队列防止重复执行

### 改进措施

**1. 共享PostgreSQL Checkpointer生产化验收（优先级：高）**
- **已实现**：`WORKFLOW_CHECKPOINT_BACKEND=postgres` 时使用 `PostgresSaver.fromConnString(DATABASE_URL)`，SQLite 分支保留为默认本地后端
- **已验证（WSL 专用随机临时库）**：三条 PostgreSQL migration 已成功应用，跨 Saver/Graph 的完整 workflow crash recovery 已通过；随机角色、数据库和 staging 目录均已清理。
- **已实现**：跨实例 crash recovery 自动化集成测试。它创建两个独立 `PostgresSaver` 与两个独立 Graph，模拟实例 A 在 review 节点崩溃、实例 B 续跑同一 `threadId`；仅接受 `AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL`，不会复用 `DATABASE_URL`。
- **待实测**：Docker Compose 与当前提交对应的 GitHub Actions PostgreSQL job 仍未取得独立环境成功回传。Docker Desktop 安装包已下载并校验，但尚未安装或启动；因此本机 Docker CLI 仍不可用。
- **目标设计**：在独立测试数据库中持续验收真实 workflow 的 interrupt / resume / crash recovery，并接入稳定的 CI PostgreSQL 服务；生产负载、队列、exactly-once 和多地域不属于当前验收范围。

```typescript
// 已实现的后端选择核心代码；WSL 跨实例 workflow 验收已通过，Docker/CI 仍待实测
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
```

**2. 分布式租约 + Fencing Token**
- **已实现**：`DevelopmentWorkflow` 新增 `leaseOwnerId` 与单调递增 `leaseToken`，SQLite/PostgreSQL 均有迁移。创建、resume、recovery 使用带 `version + leaseToken` 的条件更新进行原子领取；状态同步和失败写入同时校验 `ownerId + token`，旧持有者不能覆盖新状态。
- **已实现**：运行中的 workflow 每 10 分钟续租一次（租期 30 分钟）；续租失败会返回 `WORKFLOW_LEASE_FENCED`，最终写入仍会被 token 条件拒绝。
- **已验证**：本地迁移、协议单测覆盖过期接管、未过期抢占拒绝、正常续租以及旧持有者拒写；不涉及真实模型调用。
- **已验证（WSL 专用随机临时库）**：多进程并发领取、续租、过期接管竞争与旧 token 写入拒绝均已通过；这不是生产压测。
- **待实测**：Docker Compose 与当前提交对应的 GitHub Actions job 的独立环境复验；生产压测尚未执行。
- **目标设计**：后台队列消费场景使用 PostgreSQL 行级锁（`SELECT ... FOR UPDATE SKIP LOCKED`）领取批量任务；该队列能力尚未实现。

**3. 后台队列（pg-boss方案）**
- 引入`pg-boss`或`BullMQ`管理工作流任务队列
- 保证exactly-once执行语义
- 配合Outbox模式，确保"任务入队"与"状态更新"的原子性

---

## 改进方向三：RAG召回质量提升

### 问题描述
面试中暴露的主要问题：
1. 当前知识库仅12篇文档，规模严重不足
2. `chunkMarkdown`的heading感知对纯文本文档无效
3. RRF的`k=60`是经验值，未做系统性调优
4. 无召回质量评估指标（Recall@5、MRR、NDCG）

### 改进措施

**1. 扩大知识库规模**
- 目标：从12篇扩展至1000+篇文档
- 建立文档分类标准：技术文档 vs 业务文档 vs API参考
- 为每类文档选择最优切分策略

**2. 建立RAG评估基准**
- **已实现**：RAG Golden Set v0。它包含 12 条确定性检索意图、12 个相关 chunk 与 4 个共享噪声 chunk；清单带 SHA-256，`npm run quality:rag:golden` 会对 Recall@k、MRR、引用完整率和无关结果率执行不退化校验，并已加入 CI。
- **已验证**：2026-07-30 本地离线基线中，clean `Recall@1=1.0 / MRR=1.0`；shared-noise `Recall@5=1.0 / MRR=1.0 / citationCompleteness=1.0 / irrelevantResultRate=0.5862068965517241`。这些数字仅适用于冻结 fixture，不代表生产知识库质量。
- **已实现并已验证（冻结 fixture）**：Golden Set v0 已增加共享噪声 `NDCG@10` 不退化门禁；它只说明固定 fixture 中相关证据的排序没有退化。
- **目标设计**：扩展为至少 100 条经人工标注、覆盖技术文档、业务文档和 API 参考等多来源真实文档的 Golden Set，并在真实文档上复测 NDCG@10；在此之前不得用 v0 数据声称通用 RAG 召回能力。
- **已实现（标注准备工具链）**：`quality:rag:human-golden:template` 在 Git 忽略的 `local-only/` 创建来源、chunk、query/审核三张 TSV 表；`quality:rag:human-golden:build` 自动冻结来源快照哈希并编译为既有严格 JSON 契约。工具链不生成或伪造人工数据；100+ 已审核真实样本与实际检索指标仍待实测。

**3. RRF权重调优**
- 当前：TF-IDF + bge-m3Embedding各自召回后RRF融合，`k=60`
- **已实现（待真实人工数据实测）**：`quality:rag:human-golden:comparison` 支持 `--rrf-k-values 30,45,60,90`，在同一冻结数据集、语料哈希、embedding 模型和检索实现下输出所有候选指标与确定性选择记录。选择规则固定为：Recall@K、NDCG@K、MRR、较低无关结果率、较小 `k`；未通过人工 Golden Set 就绪性门禁时只输出 `not_ready`，不调参。
- 考虑根据查询类型（精确关键词 vs 语义模糊）动态调整权重

**4. 完善语义NLI验证器（Tier 2）**
- 当前`enforceEvidenceAndHumanGate`只做结构性校验（Set.has，Tier 1）
- 计划M2实现：引入本地NLI模型做语义一致性校验（Tier 2）
- 面试中应始终使用"两层校验框架"描述，不要自我矮化为"就是个in操作符"

---

## 改进方向四：性能与成本优化

### 问题描述
缺乏完整的可观测性，无法回答"这次工作流花了多少钱""哪个节点最慢"。

### 改进措施

**1. OpenTelemetry全链路追踪**
- 在每个LangGraph节点入口/出口添加span
- 记录：节点名、耗时、输入token、输出token、成本
- 接入Jaeger或Grafana Tempo可视化

**2. Token成本分析**
- 按Agent角色（Planner/Candidate/Reviewer/Evaluator/Reporter）分别统计token消耗
- 识别成本最高的节点，针对性优化prompt

**3. Prompt压缩**
- **已实现**：顺序 Agent 服务在每次模型调用前执行滑动窗口裁剪：最多保留 8 条最新前序结论、每条最多 2,000 字符、总计最多 12,000 字符；超长单条会带显式截断标记。限制发生在 `priorAssistantMessages` 的实际传递边界。
- **已验证**：纯函数单测覆盖“最新优先、时间顺序、单条截断、总字符预算”；它不调用模型。
- **待实测**：尚未采集真实 Provider 的 token、延迟或成本数据，因此不能声称节省比例。摘要压缩与评审工作流的结构化 prompt 压缩仍是目标设计。

**4. 相似查询缓存**
- 对高频相似查询（余弦相似度>0.95）缓存RAG召回结果
- 使用Redis或内存LRU，TTL设为1小时

---

## 改进方向五：人机协作体验

### 问题描述
当前`humanApproval`节点触发后，用户只能看到一个审批请求，无法了解workflow的执行历史和当前状态。

### 改进措施

**1. Checkpoint时间轴可视化**
- 在审批UI中展示workflow各节点的执行状态
- 显示：节点名 → 状态（completed/interrupted/pending）→ 耗时
- 让用户在审批时有足够上下文做决策

**2. 置信度驱动的干预推荐**
- 当前`needs_human`触发阈值是固定规则
- 改进：为Evaluator添加置信度评分（0-1）
- 高置信度（>0.8）自动通过，低置信度（<0.4）才触发human gate
- 减少不必要的人工干预，提高自动化率

**3. 增量审批（逐字段编辑）**
- 当前审批只能全量approve/reject
- 改进：允许用户对ExecutionPlan的单个task进行修改后再审批
- 基于LangGraph的`Command({resume})`机制实现局部状态更新

---

## 改进方向六：扩展应用场景

### 问题描述
当前只有"需求规划→评审→报告"一种工作流，框架的复用性未得到验证。

### 改进措施

**1. Code Review工作流**
- 复用同一个`StateGraph`结构
- 替换节点内容：需求分析→代码静态分析，候选方案→多个重构建议
- 验证框架通用性

**2. Bug诊断工作流**
- 输入：错误日志 + 代码上下文
- 节点：症状分析→根因候选→验证方案→修复报告
- 与现有`ExecutionPlan`的`dependsOn`机制天然兼容

---

## 改进方向七：工程化成熟度

### 问题描述
面试中被追问CI/CD、测试覆盖率、架构文档时，当前回答只能说"有基础测试"。

### 改进措施

**1. GitHub Actions质量门控**
- 每次PR触发：类型检查（tsc）→ 单元测试 → 覆盖率检查（>80%）→ RAG评估（Recall@5不退化）
- 阻断不符合质量标准的合并

**2. 性能回归基准**
- 在CI中运行固定基准测试（24条样本），对比历史结果
- 覆盖率下降超过5%时发出警报

**3. 架构文档补全**
- 用Mermaid图描述：StateGraph节点关系、RAG三路召回流程、数据库表关系
- 放置在`docs/architecture/`目录下
- 这是面试中被追问"为什么选LangGraph"时最直观的辅助材料

---

## 改进方向八：面试问答改进映射

以下问题在本轮面试中被识别为回答薄弱点，需要对应代码改进来支撑更强的面试叙述：

| 面试问题 | 当前弱点 | 代码改进支撑 |
|---------|---------|-------------|
| 证据驱动评估机制 | 容易自我矮化为"就是Set.has()" | 实现Tier 2 NLI验证器，使"两层框架"有真实代码支撑 |
| 多Agent vs 单Agent效果 | 86.2% < 99.3%，无法解释根因 | 完成消融实验，给出有数据支撑的根因分析 |
| 并发控制与多实例 | 只有本地SQLite，无法水平扩展 | 实现PostgreSQL Checkpointer + 分布式租约 |
| Reviewer多样性机制 | 依赖prompt暗示，机制不稳定 | 在prompt中明确化两个独立视角规则，增加多样性评分指标 |
| RAG召回质量 | 无定量评估指标 | 建立Recall@5评估基准，在CI中运行 |
| priorAssistantMessages截断 | 已知技术债但未解决 | 实现滑动窗口压缩，消除这个已承认的问题 |

---

## 执行优先级

## 当前实施顺序（2026-07-30 修订）

V2 的优先级不变，但不能将早期测试草案中的预设达标数字或“Reviewer 一定是根因”的假设当作实施依据。按以下顺序推进：

1. **状态收口与基线冻结**：统一 README、状态页、质量说明与命令，使已实现、已验证、待实测和目标设计不互相矛盾；冻结案例、模型精确版本、温度、Prompt 版本、RAG 快照与预算。
2. **P0-1 消融实验数据闭环**：先生成冻结四臂运行计划；经负责人明确确认外部成本后，收集完整 ledger、原始输出哈希、排除原因和配对 bootstrap 报告。只有报告产生后，才根据数据决定是否修改 Candidate、Reviewer、Evaluator 或 Prompt。
3. **P0-2 PostgreSQL 生产化验收**：在独立测试数据库中先执行跨实例 Checkpoint 恢复，再执行多进程租约领取、续租和旧 token 拒写测试。代码和单测通过不等同于生产验收。
4. **P1 质量与可观测性**：扩展人工标注 RAG Golden Set 后再调 RRF；以真实 Provider 数据验证上下文裁剪与追踪价值；Tier 2 NLI 以前先建立 Tier 1 的错误案例集。
5. **P2 产品扩展**：在 P0/P1 证据稳定后，再扩展增量审批、Code Review、Bug 诊断、后台队列和更多 CI 门禁。

真实模型运行必须双显式确认 `--execute --confirm-external-costs`；PostgreSQL 集成测试必须使用专用测试连接串，不能复用开发或生产 `DATABASE_URL`。

### P0（最优先，直接影响面试核心叙述）
1. 消融实验 + 多Agent根因诊断（改进方向一）
2. PostgreSQL共享Checkpointer（改进方向二）

### P1（面试中被追问时的加分项）
3. Recall@5 RAG评估基准（改进方向三）
4. priorAssistantMessages截断（改进方向四）
5. Tier 2 NLI语义验证器（改进方向三）

### P2（工程化加分，暂缓）
6. 后台队列（pg-boss）
7. OpenTelemetry追踪
8. GitHub Actions质量门控
9. 扩展应用场景

---

## 执行原则（继承自V1）

- **数据先行**：所有改进效果必须有真实数据支撑，不编造数字
- **模块推进**：一次只实现一个模块，不做大爆炸式重构
- **代码有注释**：每段新增代码必须有中文注释，小白可读
- **边界清晰**：文档中明确区分"已实现"和"目标设计"，不混淆
