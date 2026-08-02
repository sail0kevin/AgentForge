# AgentForge 项目报告
<!-- 文件名：project-report - 当前项目报告 -->
<!-- 所属目录：reports - 对外发布报告 -->

原始报告日期：2026-07-19（Asia/Shanghai）
更新时间：2026-08-02（Asia/Shanghai）

## 1. 产品定位

AgentForge 是一个面向 Web 项目的多智能体“需求到产品/UI实施报告”平台。用户提供产品或网站需求后，平台计划并调度不同职责的 Agent 与本地知识工具，生成三套互相独立的产品/UI实施报告：体验优先、视觉优先和工程优先。每套报告描述页面与路由、区块结构、用户流程、页面状态、失败恢复、设计方向、Design Token、组件、响应式规则、无障碍要求和视觉验收标准，便于交给下游 AI 编程 Agent 生成真实网站或 UI。

AgentForge 当前交付的是可审计的实施报告和验收闭环，不宣称自身已经自动生成完整网站、自动部署或替代人工验收。

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
  → Reporter 生成三套产品/UI实施报告
  → 导出单套或整组 Markdown，并复制下游 AI 编程 Prompt
  → 下游 AI 编程 Agent 生成真实网站/UI
  → 用户回写运行验收结果，反馈进入报告组状态
  → 保存 Run、Artifact、Review、来源和最终状态
```

报告章节由 Planner 根据项目类型动态选择。官网、管理后台和学习计划应用不会被强制套用同一份固定模板。

## 3. 当前实现阶段

当前代码是上述目标的可审计 Web MVP。除保留“需求分析师 → 开发报告负责人”的顺序运行原型外，已经提供独立 Planner、知识 Tool、交叉评审 API 和产品/UI报告中心，验证以下基础能力：

- 前序 Agent 输出可以传递给后续 Agent；
- 单个 Agent 失败后队列仍可按规则继续；
- SSE 展示开始、完成、失败和终态事件；
- 消息、失败记录和 TokenUsage 可持久化；
- Provider 凭证在服务端加密，浏览器只接收掩码状态；
- TF-IDF 可从当前用户文档中检索轻量上下文；
- 每次手动运行具有唯一 runId、服务端锁和消息/用量归属；
- 三类 Provider 具有统一超时，SSE 取消可中止底层请求；
- 核心链路具有隔离数据库 E2E 和构建验证；
- delivery/quality 候选生成时上下文隔离，随后进入结构化 Reviewer 和 Evaluator；
- 无证据 Finding 不能阻断，高影响跨候选冲突必须由用户确认；
- Review、失败终态、预算、轮次和人工裁决按用户持久化，重复裁决幂等且不能被不同选择覆盖；
- 产品/UI报告组可持久化三套方案、单套/整组导出 Markdown，并生成可复制给下游 AI 编程 Agent 的 Prompt；
- 用户可回写真实网站验收结果；三套方案全部通过时报告组进入 `accepted`，任一方案需要修改时进入 `needs_revision`。

当前手动运行中的单 Agent 执行内核使用线性 LangGraph；认证 Planner 能够生成并持久化结构化分析、计划和动态目录；计划授权的只读知识 Tool 返回带章节、行号、版本与许可的引用；`/api/reviews` 实现 baseline/model 候选、Review、Evaluator、有限修订与人工确认；`/api/reports` 和 `/reports` 实现 ReportArtifact 版本链、动态报告、来源、幂等、Markdown 导出和独立报告中心；产品/UI报告 API 与报告中心进一步支持三套方案的报告组持久化、Prompt 复制、验收反馈和状态收敛；`/workflows` 进一步把这些能力合并为支持 baseline/model、持久 Checkpoint、暂停、恢复和故障继续的产品流。

## 4. 架构演进

```text
当前：Route → RunService → SingleAgent LangGraph
                  → Model / Retriever / Tool adapters
                  → Run / Message / TokenUsage persistence
已扩展：PlanningArtifact → ReviewWorkflow → Human Approval
已扩展：ReportArtifact → Report Page / Markdown Export
已扩展：Product/UI Report Group → 三套方案 / Downstream Prompt / Acceptance Feedback
已扩展：Product Workflow → Checkpoint / Interrupt / Resume / Recover
下一扩展：真实模型盲评 → GitHub 证据冻结 → 共享 Checkpointer / 多实例恢复
```

认证、用户隔离、AES-256-GCM 凭证、Provider 路由、SSE、Prisma 和 TF-IDF fallback 会继续保留；结构化 Planner、Review、受控 Tool、人工确认、ReportArtifact、报告导出、产品/UI报告组、下游 Prompt、验收反馈、Checkpoint 和工作流页已经加入。下一阶段仍需处理真实模型盲评、GitHub 证据冻结和部署级共享恢复。

## 5. 报告质量控制

- 候选方案独立生成，减少相互锚定；
- Reviewer 必须指出失败场景、证据和可执行建议；
- Evaluator 按需求覆盖、可行性、成本、可维护性和可测试性评价；
- 修订轮次、Token、费用和超时均有限制；
- 关键冲突交给用户确认，模型不能静默替代；
- 最终报告保留假设、风险、来源和未决事项；
- 三套产品/UI报告用不同关注重点供下游实现和人工比较，不把任意一套报告自动当作最终设计结论。

## 6. 知识和工具边界

专业知识在开发阶段人工筛选、审查和版本化，运行时从本地知识包受控检索。首批方向聚焦 Web UI/UX、可访问性、组件结构、表单和 AI 工作流界面。

RAG 提供可引用的知识片段；Tool 执行具有 Schema、权限、超时、次数和审计约束的确定性能力。运行时不会让模型随意搜索 GitHub、执行外部代码或进行未经授权的写操作。当前 GitHub/UI 参考证据仍需完成来源、固定 SHA 和许可证审计后，才能作为正式证据进入报告。

## 7. 当前验证与限制

当前统一基线命令：

```bash
npm run quality:all
```

该命令串联固定检索夹具、仓库文档检索、盲评清单与运行计划、合成 dry-run、单元测试、核心 E2E、Session 隔离 E2E、TypeScript、ESLint 和 Production Build。

已知限制包括：历史主加密密钥仍需人工轮换；PostgreSQL schema、迁移、跨实例恢复与 lease/fencing 已在 WSL 专用临时环境验收，但目标环境备份恢复、Docker、远程 CI 和生产负载仍未独立验证；当前 RAG 仍为 TF-IDF，固定夹具和项目文档冒烟门禁不能代表通用检索或真实模型质量；盲评基础设施已冻结 12 案例并生成 5 变体共 60 项计划，但尚未完成 60 次真实模型运行和至少 2 名独立评分者评分；人工 RAG Golden Set 仍待人工标注；正式导出目前只有 Markdown；GitHub 参考证据尚未完成 SHA/许可证审计；AgentForge 尚未由自身生成真实网站，完整 WCAG 人工审计和 Electron 桌面交付尚未执行。

历史证据：2026-07-19 文档收口后最终完整执行 `npm run quality:all`，退出码为 0；单元测试 72/72、隔离 SQLite 核心 E2E 24/24、Session 账号切换 E2E 1/1、仓库文档检索 31 个 Chunk 且 6/6 命中、九次 migration 可从空库应用、生产构建和全量 lint 通过。

2026-08-01 历史完整门禁证据：单元测试 193/193，覆盖率与核心 E2E 结果见当前开发状态文档。

本轮证据：2026-08-02 聚焦验证通过 `208/208` Unit、`npm run db:validate`、`npm run db:validate:postgres`、TypeScript、ESLint 和 Next.js Production Build；本轮没有把完整 E2E、真实 Provider、目标环境数据库持久化或真实网站视觉验收写成已通过。完整实验和失败记录见[工程整改与开发总报告](../remediation - 工程整改实施/2026-07-19 - final-report - 工程整改与开发总报告.md)。

当前事实见[开发状态](../2026-08-01 - current-development-status - 当前开发状态.md)，正式目标见[设计文档](../design - 产品设计方案/旧 - design-index - 设计文档总入口.md)，实施顺序见[整改总览](../remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md)。