# AgentForge 简历项目描述
<!-- 文件名：2026-08-02 - resume-project-description - 简历项目描述 -->

更新时间：2026-08-02（Asia/Shanghai）

> 本文档是简历和面试表达入口。当前事实以[当前开发状态](./2026-08-01 - current-development-status - 当前开发状态.md)和[V2证据基线](./2026-08-01 - v2-evidence-baseline - V2证据基线.md)为准。

## 一句话简介

AgentForge 是一个基于 Next.js、LangGraph 和 Prisma 的 local-first Web MVP，将零散开发需求转化为包含需求澄清、任务拆解、依赖、风险、证据和验收要求的可追溯开发方案报告，并通过多角色候选、交叉评审、人工裁决和 Checkpoint 恢复形成可审计的工作流闭环。

## 技术栈

`TypeScript`、`React`、`Next.js`、`LangGraph`、`LangChain`、`Prisma`、`SQLite`、`PostgreSQL`、`SSE`、`Playwright`、`Node.js Test Runner`、`OpenTelemetry`、`TF-IDF`、`Embedding`、`RRF`、`Ollama`、`OpenAI-compatible Provider`

补充边界：SQLite 是默认本地业务库和 Checkpoint 后端；PostgreSQL Checkpointer、独立 Prisma schema/migration、租约和 Fencing Token 已实现，并在 WSL 专用随机临时数据库完成验收。Docker、远程 CI、生产负载和目标环境备份恢复仍需独立验证。

## 简历精简版

**AgentForge｜开发方案生成平台**

基于 Next.js、LangGraph、Prisma 构建可恢复的多智能体开发方案生成平台，将需求转化为包含任务、依赖、风险、证据和验收标准的结构化报告。

- 设计并实现 Planner → Delivery / Quality 双候选 → Reviewer → Evaluator → Human Approval → Reporter 的 LangGraph 工作流；Planner 先执行需求完整性判断，信息不足时通过持久化 `interrupt/resume` 追问，补充后从同一 `threadId` 继续执行。
- 以 `PlanningArtifact`、`Candidate`、`Finding`、`EvaluationResult` 和 `ReportArtifact` 作为 Agent 间结构化交接产物，加入计划授权、依赖 DAG、来源引用、证据绑定、预算和失败状态校验，避免自然语言结果直接向下游扩散。
- 实现交叉评审和有限修订闭环：Delivery 关注交付效率，Quality 关注工程风险；Reviewer 输出带来源的 Finding，Evaluator 根据证据和冲突决定自动通过、定向修订或人工确认，最终生成不可变版本化报告。
- 实现 SQLite / PostgreSQL Checkpoint 可切换、跨实例恢复、工作流租约和单调递增 Fencing Token；旧持有者的续租和状态写入会被条件更新拒绝，降低多实例并发下的重复执行和旧状态覆盖风险。
- 建立 RAG 证据链和离线质量门禁：支持标题路径与真实行号引用、TF-IDF 检索、可选 Embedding + RRF 混合路径、来源快照和 Golden Set 回归；当前 fixture 回归通过，但尚无真实人工知识库 Recall@5 结论。
- 建立工程质量基线：本地质量门禁为 `193/193` Unit、`24/24` Core E2E、`1/1` Session Isolation E2E，`src/lib/**` 行/分支/函数覆盖率为 `92.30% / 87.62% / 89.49%`，并通过 TypeScript、ESLint、文档链接检查和生产构建。

## 详细职责与成果

### 1. 工作流与需求规划

- 将需求生成拆分为可恢复的状态图，而不是让单个 Agent 一次性输出完整方案。
- Planner 先判断信息是否足够；缺失关键信息时暂停并持久化等待状态，用户补充后恢复同一工作流。
- 生成结构化 `RequirementAnalysis`、`ExecutionPlan`、动态报告目录和 `PlanningArtifact`，服务端校验任务数量、依赖 DAG、允许工具、Token/费用预算和章节引用。
- 通过节点幂等键、版本控制、持久化 WorkflowNode 和 Checkpoint，支持刷新、异常后继续以及已完成副作用不重复执行。

### 2. 多 Agent 协作与评审治理

- Delivery Candidate 从交付效率角度提出方案，Quality Candidate 从工程质量、风险和约束角度提出独立方案。
- Reviewer 不直接覆盖候选，而是输出结构化 Finding，包含严重级别、归属候选、证据引用和建议动作。
- Evaluator 校验 Finding 是否有证据支持，并对高影响冲突进入人工审批；人工审批支持任务级增量修改，服务端重新校验修改后的计划并记录原始/修订指纹。
- 把多 Agent 的价值从“必然提升结果质量”调整为“提供独立视角、证据门禁和人工可控的治理机制”，避免把未经实验证明的效果写成结论。

### 3. 持久化、并发和安全

- 使用 Prisma 保存工作流、节点、产物、报告版本、人工选择、工具调用和用量审计。
- 支持 SQLite 默认后端与 PostgreSQL 应用 schema / migration；LangGraph Checkpoint 根据环境变量选择 SQLite 或 PostgreSQL Saver。
- 使用工作流租约、持有者标识、版本和单调递增 Fencing Token，保护领取、续租、恢复和最终状态写入。
- 实现用户、Session、Workspace、Document、Run、Review、Report 和 Workflow 的服务端隔离；API Key 服务端加密保存，浏览器只接收掩码。

### 4. RAG、证据和可观测性

- Markdown 按 H1-H6 标题路径和真实行号切块，检索结果保留来源、版本和引用位置。
- 默认 TF-IDF 检索；在向量模型和语料条件满足时，支持 Embedding 与 TF-IDF 通过 RRF 融合，并在不满足条件时确定性回退。
- 具备 RAG Golden Set v0、仓库文档检索冒烟、人工 Golden Set 标注包准备和 RRF 参数选择规则。
- 实现前序 Agent 上下文滑动窗口裁剪，以及 OpenTelemetry OTLP 导出边界；当前已经验证配置和链路接口，真实 Provider 的成本、延迟和追踪收益仍待测量。

### 5. 应用场景扩展

- 新增 Code Review 和 Bug Diagnosis 独立 LangGraph 场景图及受限 UI/API。
- Code Review 只分析用户提交的代码快照，并输出带文件/行号的模式 Finding 和整改候选。
- Bug Diagnosis 将日志和上下文整理为症状、可能根因、验证步骤和修复边界。
- 两个场景用于验证工作流框架可复用性，不表述为通用 SAST、自动修复或已经验证的生产诊断效果。

## 当前可交付结果

当前可以交付的是一个可本地运行、可演示、可测试的 Web MVP：

1. 用户输入开发需求。
2. 系统分析需求完整性，并在必要时暂停追问。
3. Planner 生成计划、任务依赖和报告目录。
4. Delivery / Quality 生成不同视角的候选方案。
5. Reviewer 和 Evaluator 进行带证据的评审与决策。
6. 用户在高影响冲突处进行全量或任务级人工确认。
7. Reporter 生成带版本、来源、风险、未决项、成本和 Markdown 导出的开发报告。
8. 工作流可以从 Checkpoint 恢复，报告和运行数据可审计。

## 面试中可以直接讲的真实结果

- 当前本地自动化门禁：`193/193` Unit、`24/24` Core E2E、`1/1` Session Isolation E2E。
- 当前 `src/lib/**` 覆盖率：行 `92.30%`、分支 `87.62%`、函数 `89.49%`。
- PostgreSQL：WSL 专用随机临时数据库完成 migration、跨 Saver/Graph Checkpoint 恢复、多进程租约领取/续租/接管、Fencing Token 旧写入拒绝。
- RAG：12 条确定性 Golden Set fixture 的 `Recall@1`、共享噪声 `Recall@5` 和 `NDCG@10` 回归门禁通过；这不是生产知识库召回率。
- 消融实验：已完成 24 案例 × 5 重复 × 4 臂，共 480 条无模型 preflight；实际 Provider 调用为 0，实际外部支出为 `$0`。真实四臂质量结果尚未产生。
- 真实 24-case 探索性对比中，单 Agent 覆盖率为 `99.3%`，完整多 Agent 为 `86.2%`。该结果基于关键词 checklist 且存在模型波动，当前不能声称多 Agent 相较单 Agent 有质量提升；它直接促成了后续四臂消融协议和评测治理建设。

## 已实现、已验证与待实测边界

| 类别 | 当前内容 |
|---|---|
| 已实现 | LangGraph 产品工作流、Planner 澄清、双候选、Reviewer、Evaluator、人工审批、增量审批、Reporter、版本化 Artifact、SQLite/PostgreSQL Checkpoint 分支、租约/Fencing、RAG 检索链、RAG Golden Set 工具、OTel 导出边界、Code Review/Bug Diagnosis 场景图、测试与质量门禁 |
| 已验证 | 本地单元/E2E/Session 隔离、类型检查、ESLint、生产构建、WSL 专用 PostgreSQL 临时库恢复和租约验收、确定性 RAG fixture 回归、消融计划和授权预检 |
| 待实测 | 真实四臂消融质量结果、人工标注多来源 Golden Set 的真实 Recall@5/MRR/NDCG、真实 Provider 的 Token/延迟/成本收益、Docker Compose、当前提交对应的远程 CI PostgreSQL job、目标环境备份恢复、生产并发负载和真实用户试点反馈 |
| 目标设计 | 后台任务队列、exactly-once 语义、多地域部署、生产级 NLI 语义验证、通用仓库 Code Review、自动修复、Electron 正式交付和 PDF/DOCX 导出 |

## 不建议写进简历的表述

- “多 Agent 让方案质量提升了 X%”：当前真实 24-case 探索性结果不支持这个结论。
- “RAG Recall@5 提升 X%”：当前人工 Golden Set 为 `not_ready`，12 条 fixture 只能证明回归链路。
- “已完成生产级 PostgreSQL / Docker / CI”：当前 WSL 专用临时库已验收，Docker、远程 CI 和生产负载仍需独立证据。
- “实现 exactly-once”：当前有 Checkpoint、幂等和租约/Fencing，但后台队列与 exactly-once 语义仍是目标设计。
- “Code Review 已接入真实仓库并替代 SAST”：当前只分析用户提交的受限代码快照。

## 面试展开顺序

1. 先讲产品问题：单 Agent 输出容易遗漏约束，且缺少独立检查和恢复机制。
2. 再讲状态图：Planner 澄清、双候选、评审、Evaluator、人工确认和报告生成。
3. 再讲工程难点：结构化 Artifact、证据绑定、Checkpoint、幂等、租约/Fencing 和用户隔离。
4. 再讲质量方法：193/193、E2E、覆盖率、RAG fixture、四臂消融协议和真实结果边界。
5. 最后主动讲限制：多 Agent 质量收益尚未被证明，真实模型实验、人工 RAG 集和生产环境验收仍在推进。

## 推荐简历最终表述

**AgentForge｜开发方案生成平台**

独立设计并实现基于 Next.js、LangGraph、Prisma 的 local-first 多智能体开发方案生成平台。将需求分析、计划拆解、交付/质量双候选、证据化交叉评审、Evaluator、人工审批和版本化报告组织为可暂停、可恢复、可审计的状态图；通过结构化 Artifact、服务端计划校验、来源引用、预算审计和任务级增量审批降低 Agent 间错误传递。实现 SQLite/PostgreSQL Checkpoint 切换、工作流租约与 Fencing Token、多用户/Session 隔离、TF-IDF + 可选 Embedding/RRF 检索、OTLP 可观测性边界及 Code Review/Bug Diagnosis 场景图。本地门禁通过 `193/193` Unit、`24/24` Core E2E、`1/1` Session Isolation E2E，`src/lib/**` 覆盖率为 `92.30% / 87.62% / 89.49%`；同时通过四臂消融实验协议识别并保留“多 Agent 质量收益尚未证明”的真实结论。
