# AgentForge 项目报告
<!-- 文件名：project-report - 当前项目报告 -->
<!-- 所属目录：reports - 对外发布报告 -->

更新时间：2026-07-19（Asia/Shanghai）

## 1. 产品定位

AgentForge 是一个面向 Web 项目的多智能体需求规划与开发方案生成平台。用户提供项目需求后，平台计划并调度不同职责的 Agent 与本地知识工具，生成候选方案、执行交叉评审和质量评价，最终形成带来源、风险、取舍和实施步骤的动态开发方案报告。

它不是通用自主 Agent 平台，也不以自动编写完整代码、自动部署或无限循环执行为目标。

## 2. 目标工作流

```text
用户需求
  → 结构化需求分析
  → Planner 生成执行计划与动态报告目录
  → 服务端校验计划、权限、预算和轮次
  → 检索本地专业知识并调用受控工具
  → 不同目标导向的 Agent 独立生成候选方案
  → Reviewer 提交有证据的 finding
  → Evaluator 采纳、退回、有限修订或请求人工确认
  → Reporter 生成动态开发方案报告
  → 保存 Run、Artifact、Review、来源和最终状态
```

报告章节由 Planner 根据项目类型动态选择。官网、管理后台和学习计划应用不会被强制套用同一份固定模板。

## 3. 当前实现阶段

当前代码是上述目标的可审计 Web MVP。除保留“需求分析师 → 开发报告负责人”的顺序运行原型外，已经提供独立 Planner、知识 Tool 和交叉评审 API，验证以下基础能力：

- 前序 Agent 输出可以传递给后续 Agent；
- 单个 Agent 失败后队列仍可按规则继续；
- SSE 展示开始、完成、失败和终态事件；
- 消息、失败记录和 TokenUsage 可持久化；
- Provider 凭证在服务端加密，浏览器只接收掩码状态；
- TF-IDF 可从当前用户文档中检索轻量上下文；
- 每次手动运行具有唯一 runId、服务端锁和消息/用量归属；
- 三类 Provider 具有统一超时，SSE 取消可中止底层请求；
- 核心链路具有隔离数据库 E2E 和构建验证。
- delivery/quality 候选生成时上下文隔离，随后进入结构化 Reviewer 和 Evaluator；
- 无证据 Finding 不能阻断，高影响跨候选冲突必须由用户确认；
- Review、失败终态、预算、轮次和人工裁决按用户持久化，重复裁决幂等且不能被不同选择覆盖。

当前手动运行中的单 Agent执行内核使用线性 LangGraph；认证 Planner能够生成并持久化结构化分析、计划和动态目录；计划授权的只读知识 Tool返回带章节、行号、版本与许可的引用；`/api/reviews`实现 baseline/model 候选、Review、Evaluator、有限修订与人工确认；`/api/reports`和`/reports`实现ReportArtifact版本链、动态报告、来源、幂等、Markdown导出和独立报告中心；`/workflows`进一步把这些能力合并为支持baseline/model、持久Checkpoint、暂停、恢复和故障继续的产品图。

## 4. 架构演进

```text
当前：Route → RunService → SingleAgent LangGraph
                  → Model / Retriever / Tool adapters
                  → Run / Message / TokenUsage persistence
已扩展：PlanningArtifact → ReviewWorkflow → Human Approval
已扩展：ReportArtifact → Report Page / Markdown Export
已扩展：Product Workflow → Checkpoint / Interrupt / Resume / Recover
下一扩展：真实模型盲评 → 共享Checkpointer / 多实例恢复
```

认证、用户隔离、AES-256-GCM 凭证、Provider 路由、SSE、Prisma 和 TF-IDF fallback 会继续保留；结构化 Planner、Review、受控 Tool、人工确认、ReportArtifact、报告导出、Checkpoint和工作流页已经加入，下一阶段处理真实模型盲评和部署级共享恢复。

## 5. 报告质量控制

- 候选方案独立生成，减少相互锚定；
- Reviewer 必须指出失败场景、证据和可执行建议；
- Evaluator 按需求覆盖、可行性、成本、可维护性和可测试性评价；
- 修订轮次、Token、费用和超时均有限制；
- 关键冲突交给用户确认，模型不能静默替代；
- 最终报告保留假设、风险、来源和未决事项。

## 6. 知识和工具边界

专业知识在开发阶段人工筛选、审查和版本化，运行时从本地知识包受控检索。首批方向聚焦 Web UI/UX、可访问性、组件结构、表单和 AI 工作流界面。

RAG 提供可引用的知识片段；Tool 执行具有 Schema、权限、超时、次数和审计约束的确定性能力。运行时不会让模型随意搜索 GitHub、执行外部代码或进行未经授权的写操作。

## 7. 当前验证与限制

当前统一基线命令：

```bash
npm run quality:all
```

该命令串联固定检索夹具、仓库文档检索、盲评清单与运行计划、合成dry-run、单元测试、核心E2E、Session隔离E2E、TypeScript、ESLint和Production Build。

已知限制包括：历史主加密密钥仍需人工轮换；PostgreSQL只有schema静态校验；当前RAG仍为TF-IDF，12类固定夹具与31个项目文档Chunk/6意图冒烟门禁不能代表通用检索或真实模型质量；盲评基础设施已冻结12案例并生成5变体共60项计划，但尚未完成60次真实模型运行和至少2名独立评分者评分；Provider原生Tool Calling、共享Checkpointer/多实例恢复仍待处理；正式导出目前只有Markdown；完整WCAG人工审计和Electron桌面交付尚未执行。

<<<<<<< HEAD:docs/reports - 对外发布报告/2026-07-19 - project-report - 当前项目报告.md
2026-07-19文档收口后最终完整执行 `npm run quality:all`，退出码为0。当前量化证据为单元测试72/72、隔离SQLite核心E2E 24/24、Session账号切换E2E 1/1、仓库文档检索31个Chunk且6/6命中、九次migration可从空库应用、生产构建和全量lint通过。完整实验和失败记录见[工程整改与开发总报告](../remediation - 工程整改实施/2026-07-19 - final-report - 工程整改与开发总报告.md)。

当前事实见[开发状态](../2026-08-01 - current-development-status - 当前开发状态.md)，正式目标见[设计文档](../design - 产品设计方案/旧 - design-index - 设计文档总入口.md)，实施顺序见[整改总览](../remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md)。
=======
2026-07-19文档收口后最终完整执行 `npm run quality:all`，退出码为0。当前量化证据为单元测试72/72、隔离SQLite核心E2E 24/24、Session账号切换E2E 1/1、仓库文档检索31个Chunk且6/6命中、九次migration可从空库应用、生产构建和全量lint通过。完整实验和失败记录见[工程整改与开发总报告](../remediation - 工程整改实施/final-report - 工程整改与开发总报告.md)。

当前事实见[开发状态](../current-status - 当前开发状态.md)，正式目标见[设计文档](../design - 产品设计方案/README - 设计文档总入口.md)，实施顺序见[整改总览](../remediation - 工程整改实施/README - 整改执行总览.md)。
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/reports - 对外发布报告/project-report - 当前项目报告.md
