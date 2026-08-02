# AgentForge 整改执行总览
<!-- 文件名：README - 整改执行总览 -->
<!-- 所属目录：remediation - 工程整改实施 -->

开始时间：2026-07-15（Asia/Shanghai）
最后更新：2026-07-20（Asia/Shanghai）
总体状态：Phase 1～7工程闭环已完成；Phase 0密钥轮换待外部确认，Phase 5真实模型盲评待执行
<<<<<<< HEAD:docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md
问题来源：[2026-07-15 代码与文档评审](../reviews - 历史评审复查/2026-07-15 - code-and-documentation-review - 代码与文档评审.md)

路线依据：[AgentForge正式设计](../design - 产品设计方案/旧 - design-index - 设计文档总入口.md)与[设计对齐复查](../reviews - 历史评审复查/2026-07-15 - design-alignment-review - 设计对齐复查.md)。Phase 0～2解决可靠执行底座；Phase 3～6实现产品核心；Phase 7负责工程和交付收口。
=======
问题来源：[2026-07-15 代码与文档评审](../reviews - 历史评审复查/2026-07-15-code-and-documentation-review - 代码与文档评审.md)

路线依据：[AgentForge正式设计](../design - 产品设计方案/README - 设计文档总入口.md)与[设计对齐复查](../reviews - 历史评审复查/2026-07-15-design-alignment-review - 设计对齐复查.md)。Phase 0～2解决可靠执行底座；Phase 3～6实现产品核心；Phase 7负责工程和交付收口。
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/remediation - 工程整改实施/README - 整改执行总览.md

## 1. 使用方式

本目录用于记录评审问题的实际整改过程。

<<<<<<< HEAD:docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md
报告详细度和表达方式统一遵循[答辩级工程报告写作规范](./2026-07-15 - reporting-standard - 答辩级报告写作规范.md)：证据达到论文级完整度，但每章必须先用白话解释，让非技术读者也能理解。
=======
报告详细度和表达方式统一遵循[答辩级工程报告写作规范](reporting-standard - 答辩级报告写作规范.md)：证据达到论文级完整度，但每章必须先用白话解释，让非技术读者也能理解。
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/remediation - 工程整改实施/README - 整改执行总览.md

- 本文件只维护总体进度、阶段状态、验证摘要和下一步。
- 详细修改步骤写入对应阶段报告，不在总览重复粘贴。
- 每完成一个可验证修改单元，同时更新代码、测试和阶段报告。
- 只有验收通过后，问题状态才能标记为“已完成”。
<<<<<<< HEAD:docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md
- 已确认的最终能力同步到 `docs/2026-08-01 - current-development-status - 当前开发状态.md`，运行链路与工程边界同步到 `docs/2026-08-01 - current-runtime-architecture - 当前运行架构.md`。
=======
- 已确认的最终能力同步到 `docs/current-status - 当前开发状态.md`，运行链路与工程边界同步到 `docs/architecture - 当前运行架构.md`。
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/remediation - 工程整改实施/README - 整改执行总览.md

状态统一使用：`待处理`、`处理中`、`部分完成`、`已完成`、`阻塞`、`暂缓`。

## 2. 阶段总览

| 阶段 | 内容 | 当前状态 | 已完成/总数 | 阶段报告 |
|---|---|---|---:|---|
<<<<<<< HEAD:docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md
| Phase 0 | 安全与数据库初始化 | 部分完成 | 1/2 | [查看](./2026-07-16 - phase-0-security-and-database - 安全与数据库初始化.md) |
| Phase 1 | 运行正确性、隔离、超时与取消 | 已完成 | 5/5 | [查看](./2026-07-15 - phase-1-runtime-correctness - 运行正确性与隔离.md) |
| Phase 2 | 统一 RunService 和事件语义 | 已完成 | 1/1 | [查看](./2026-07-15 - phase-2-run-service - 统一运行服务.md) |
| Phase 3 | 需求分析、Planner 与结构化输出 | 已完成 | 3/3 | [查看](./2026-07-15 - phase-3-planner-and-structured-output - Planner与结构化输出.md) |
| Phase 4 | 本地知识、RAG 与受控 Tools | 已完成 | 4/4 | [查看](./2026-07-15 - phase-4-knowledge-and-tools - 知识库与受控工具.md) |
| Phase 5 | 候选方案、交叉评审与评价 | 部分完成 | 2/3 | [查看](./2026-07-15 - phase-5-cross-review-and-evaluation - 交叉评审与评价.md) |
| Phase 6 | Artifact、动态报告与产品页面 | 已完成 | 3/3 | [主报告](./2026-07-15 - phase-6-dynamic-report-and-ui - 动态报告与产品界面.md) / [Checkpoint专题](./2026-07-15 - phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md) |
| Phase 7 | 前端质量、评测与交付 | 已完成 | 3/3 | [查看](./2026-07-15 - phase-7-quality-and-release - 质量与交付边界.md) |
=======
| Phase 0 | 安全与数据库初始化 | 部分完成 | 1/2 | [查看](phase-0-security-and-database - 安全与数据库初始化.md) |
| Phase 1 | 运行正确性、隔离、超时与取消 | 已完成 | 5/5 | [查看](phase-1-runtime-correctness - 运行正确性与隔离.md) |
| Phase 2 | 统一 RunService 和事件语义 | 已完成 | 1/1 | [查看](phase-2-run-service - 统一运行服务.md) |
| Phase 3 | 需求分析、Planner 与结构化输出 | 已完成 | 3/3 | [查看](phase-3-planner-and-structured-output - Planner与结构化输出.md) |
| Phase 4 | 本地知识、RAG 与受控 Tools | 已完成 | 4/4 | [查看](phase-4-knowledge-and-tools - 知识库与受控工具.md) |
| Phase 5 | 候选方案、交叉评审与评价 | 部分完成 | 2/3 | [查看](phase-5-cross-review-and-evaluation - 交叉评审与评价.md) |
| Phase 6 | Artifact、动态报告与产品页面 | 已完成 | 3/3 | [主报告](phase-6-dynamic-report-and-ui - 动态报告与产品界面.md) / [Checkpoint专题](phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md) |
| Phase 7 | 前端质量、评测与交付 | 已完成 | 3/3 | [查看](phase-7-quality-and-release - 质量与交付边界.md) |
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/remediation - 工程整改实施/README - 整改执行总览.md

## 3. 问题进度

| ID | 问题 | 优先级 | 阶段 | 状态 | 验证 |
|---|---|---:|---|---|---|
| P0-1 | `.env` 被 Git 跟踪及历史密钥轮换 | P0 | Phase 0 | 部分完成 | 已停止跟踪；无回显轮换验收脚本已验证；外部轮换待确认 |
| P0-2 | 数据库初始化链路需要恢复 | P0 | Phase 0 | 已完成 | 全新迁移和隔离 E2E 通过 |
| P1-1 | 持久工作区可能掩盖前序 Agent 失败 | P1 | Phase 1 | 已完成 | 终态单元测试 5 项 + 核心 E2E |
| P1-2 | 手动工作区缺少服务端锁和 runId | P1 | Phase 1 | 已完成 | Run/activeRunId + 并发 E2E |
| P1-3 | Provider 缺少统一超时和取消 | P1 | Phase 1 | 已完成 | 三 Provider 单测 + 超时/取消 E2E |
| P1-4 | 浏览器本地知识没有用户作用域 | P1 | Phase 1 | 已完成 | unit 4项 + Session A→B→A E2E |
| P1-5 | 上传限制在完整读取文件后才执行 | P1 | Phase 1 | 已完成 | policy unit 4项 + 上传 E2E 3项 |
| ARCH-1 | 三条运行路径语义不一致 | P1 | Phase 2 | 已完成 | RunService unit 4项 + 三入口 E2E |
| PLAN-1 | 缺少结构化需求分析与 Planner | P1 | Phase 3 | 已完成 | Zod需求分析、补充问题和认证 Planner API |
| PLAN-2 | 缺少计划校验、预算和动态报告目录 | P1 | Phase 3 | 已完成 | 白名单/DAG/预算校验 + 三类动态目录 E2E |
| PLAN-3 | 模型关键输出仍以自由文本为主 | P1 | Phase 3 | 已完成 | 机器可读 Schema、有限重试和失败持久化 |
| P1-6 | Markdown 结构在切块前被删除 | P1 | Phase 4 | 已完成 | 标题路径/真实行号 unit + citation E2E |
| P1-7 | TF-IDF 存在零召回和非真实词频 | P1 | Phase 4 | 已完成 | 平滑 IDF/对数 TF/稳定排序 + 固定评测 |
| P1-8 | 数据库 RAG 前端链路未闭环 | P1 | Phase 4 | 已完成 | 前端上传/列出/删除/启用服务端知识，Session隔离 E2E |
| TOOL-1 | Tool Registry 未初始化且工具为占位实现 | P1 | Phase 4 | 已完成 | 结构化 Tool、计划授权、超时/次数/大小/审计 E2E |
| REVIEW-1 | 缺少独立候选方案和结构化 finding | P1 | Phase 5 | 已完成 | 双候选输入隔离、Candidate/Finding Schema、Reviewer 与失败降级均有单测/E2E |
| REVIEW-2 | 缺少 Evaluator、有限修订和人工确认 | P1 | Phase 5 | 已完成 | 证据门槛、人工升级、有限修订、ReviewWorkflow 与幂等裁决已验证 |
| P2-4 | 缺少单/双 Agent 与交叉评审价值评测 | P2 | Phase 5 | 部分完成 | 确定性契约评估与匿名发卷/解盲工具链已建立；真实模型 + RAG + 人工盲评尚未执行 |
| REPORT-1 | 缺少 Run/Artifact/Review 持久化模型 | P1 | Phase 6 | 已完成 | PlanningArtifact、ReviewWorkflow、不可变 ReportArtifact版本链和生成幂等已验证 |
| REPORT-2 | 缺少动态报告生成、来源和导出 | P1 | Phase 6 | 已完成 | 动态章节、Claim来源校验、baseline/model Reporter和Markdown导出已验证 |
| REPORT-3 | 对话、工作流和报告页面尚未分离 | P2 | Phase 6 | 已完成 | `/workflows`七节点页、baseline/model统一图、持久Checkpoint、interrupt/resume、租约恢复与用户隔离均已验证 |
| P2-1 | `workspace-app.tsx` 过大且存在遗留代码 | P2 | Phase 7 | 已完成 | 主控制器约1550行降至约458行，视图/文案/类型分模块，TypeScript与Lint通过 |
| P2-2 | Workspace 创建 API 忽略 `agentIds` | P2 | Phase 7 | 已完成 | 归属、重复、顺序和失败原子性E2E通过 |
| P2-3 | Electron 尚不能作为可交付安装包 | P2 | Phase 7 | 已完成范围决策 | 0.1正式交付Web；Electron明确为实验入口，不计入发布完成度 |

## 4. 当前验证基线

| 验证项 | 基线结果 |
|---|---|
| 统一质量门禁 | 2026-07-19收口后复跑退出码0 |
| 固定RAG夹具 | 12类意图；无噪声k=1与共享噪声k=5的Recall、MRR和引用完整率均为1 |
| 仓库文档检索 | README与当前状态文档生成31个Chunk，6/6命中目标章节 |
| 盲评工具链 | 12案例、5变体、60项计划；dry-run使用2名合成评分者，`synthetic: true`、`modelCalled: false`，不代表真实质量 |
| SQLite迁移 | 9次标准迁移；隔离E2E从空库成功应用 |
| 单元测试 | 72/72通过 |
| Next.js生产构建 | 通过；运行时数据库路径不再触发NFT tracing warning |
| TypeScript / 全量Lint | 通过 |
| SQLite Prisma schema | 独立校验通过 |
| PostgreSQL Prisma schema | 独立静态校验通过 |
| 核心E2E | 隔离SQLite数据库24/24通过，覆盖baseline/model工作流、Checkpoint、失败恢复、完整模型角色链和重复副作用保护 |
| Session隔离E2E | A→B→A账号切换1/1通过，文档、计划、Run、Tool、Review、Report、Workflow详情/resume/recover均隔离 |

每完成一个阶段，在对应阶段报告中记录完整命令和输出摘要，并在这里更新最终结果。

## 5. 正式交付边界

- RAG当前仅使用轻量TF-IDF，不是Embedding、RRF或向量数据库；
- Checkpoint当前保存在本地SQLite，未验证共享Checkpointer和多实例恢复；
- Tool是由计划授权、Schema校验和审计约束的受控只读工具，Provider原生function/tool calling尚未统一接入；
- Electron只保留实验性入口，正式交付范围是Web MVP；
- 正式导出当前仅支持Markdown，PDF/DOCX尚未完成；
- 当前没有公开在线演示地址；
- 真实模型盲评尚未完成，不能声称多Agent质量、幻觉或成本收益。

## 6. 固定执行流程

```text
选择一个问题 ID
  → 记录修改前行为与验收条件
  → 修改最小代码单元
  → 添加或调整测试
  → 运行定向验证
  → 运行阶段级回归
  → 更新阶段报告
  → 更新本总览状态
  → 必要时更新 current-status 和 architecture
```

如果修改过程中发现新问题，使用 `NEW-阶段号-序号` 临时编号，记录来源、影响和是否纳入当前阶段，不能在报告中静默扩大范围。

## 7. 当前下一步

1. 由项目所有者确认历史真实密钥、Session Secret 和 Encryption Master Key 是否已经全部轮换；
2. 轮换确认后关闭 P0-1 和 Phase 0；
3. Phase 1～4已完成，Phase 5工程闭环与盲评工具链完成，但60次真实模型运行和至少2名独立评分者结果仍未完成；
4. Phase 6和Phase 7已完成：动态报告、工作流页、Checkpoint、前端拆分、Workspace契约、统一质量门和Web/Electron交付边界均已收口；
5. 下一主线是按冻结协议完成真实模型运行、独立评分和解盲汇总；在此之前不宣称多Agent质量、幻觉或成本收益；
6. 真实盲评之后再决定共享Checkpointer、多实例恢复、PDF/DOCX和WCAG人工审计范围。

## 8. 最终交付

<<<<<<< HEAD:docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md
[工程整改与开发总报告](./2026-07-19 - final-report - 工程整改与开发总报告.md)已经完成当前阶段的完整汇总，可直接用于答辩和开发交接。后续每完成一个问题或阶段，持续更新其中的当前结果、证据、风险和结论；未实现项必须写明依赖和验收条件，不保留“待填写”占位。

旧版Phase 3～5路线已保存在[历史归档](../archive - 历史归档资料/2026-07-15 - archive-index - 历史归档说明.md)，不再作为当前执行依据。
=======
[工程整改与开发总报告](final-report - 工程整改与开发总报告.md)已经完成当前阶段的完整汇总，可直接用于答辩和开发交接。后续每完成一个问题或阶段，持续更新其中的当前结果、证据、风险和结论；未实现项必须写明依赖和验收条件，不保留“待填写”占位。

旧版Phase 3～5路线已保存在[历史归档](../archive - 历史归档资料/README - 历史归档说明.md)，不再作为当前执行依据。
>>>>>>> origin/agent/agentforge-publish-2026-07-20:docs/remediation - 工程整改实施/README - 整改执行总览.md
