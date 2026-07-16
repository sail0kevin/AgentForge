# AgentForge 整改执行总览
<!-- 文件名：README - 整改执行总览 -->
<!-- 所属目录：remediation - 工程整改实施 -->

开始时间：2026-07-15（Asia/Shanghai）  
最后更新：2026-07-15 23:00（Asia/Shanghai）  
总体状态：整改进行中  
问题来源：[2026-07-15 代码与文档评审]()

路线依据：[AgentForge 正式设计]()与[设计对齐复查]()。Phase 0～2 解决可靠执行底座；Phase 3～6 实现产品核心；Phase 7 负责工程和交付收口。

## 1. 使用方式

本目录用于记录评审问题的实际整改过程。

报告详细度和表达方式统一遵循[答辩级工程报告写作规范]()：证据达到论文级完整度，但每章必须先用白话解释，让非技术读者也能理解。

- 本文件只维护总体进度、阶段状态、验证摘要和下一步。
- 详细修改步骤写入对应阶段报告，不在总览重复粘贴。
- 每完成一个可验证修改单元，同时更新代码、测试和阶段报告。
- 只有验收通过后，问题状态才能标记为“已完成”。
- 已确认的最终能力同步到 `docs/current-status - 当前开发状态.md`，长期有效结论同步到 `docs/project-memory - 项目长期记忆.md`。

状态统一使用：`待处理`、`处理中`、`部分完成`、`已完成`、`阻塞`、`暂缓`。

## 2. 阶段总览

| 阶段 | 内容 | 当前状态 | 已完成/总数 | 阶段报告 |
|---|---|---|---:|---|
| Phase 0 | 安全与数据库初始化 | 部分完成 | 1/2 | [查看]() |
| Phase 1 | 运行正确性、隔离、超时与取消 | 已完成 | 5/5 | [查看]() |
| Phase 2 | 统一 RunService 和事件语义 | 已完成 | 1/1 | [查看]() |
| Phase 3 | 需求分析、Planner 与结构化输出 | 已完成 | 3/3 | [查看]() |
| Phase 4 | 本地知识、RAG 与受控 Tools | 已完成 | 4/4 | [查看]() |
| Phase 5 | 候选方案、交叉评审与评价 | 部分完成 | 2/3 | [查看]() |
| Phase 6 | Artifact、动态报告与产品页面 | 已完成 | 3/3 | [主报告]() / [Checkpoint专题]() |
| Phase 7 | 前端质量、评测与交付 | 已完成 | 3/3 | [查看]() |

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
| 单元测试 | 62/62通过（含盲评匿名化、完整评分、解盲汇总与命令行全流程测试） |
| Next.js 生产构建 | 通过；运行时数据库路径不再触发 NFT tracing warning |
| 全量 Lint | 通过；Electron `.cjs`使用格式匹配规则、archive不进入活动代码检查、旧生成脚本无效变量已删除 |
| SQLite Prisma schema | 校验通过 |
| PostgreSQL Prisma schema | 校验通过 |
| 核心 E2E | 隔离 SQLite数据库24/24通过，覆盖baseline/model工作流、Checkpoint、失败恢复、完整模型角色链和重复副作用保护 |
| Session 隔离 E2E | A→B→A账号切换1/1通过，文档、计划、Run、Tool、Review、Report、Workflow详情/resume/recover均隔离 |

每完成一个阶段，在对应阶段报告中记录完整命令和输出摘要，并在这里更新最终结果。

## 5. 固定执行流程

```text
选择一个问题 ID
  → 记录修改前行为与验收条件
  → 修改最小代码单元
  → 添加或调整测试
  → 运行定向验证
  → 运行阶段级回归
  → 更新阶段报告
  → 更新本总览状态
  → 必要时更新 current-status 和 project-memory
```

如果修改过程中发现新问题，使用 `NEW-阶段号-序号` 临时编号，记录来源、影响和是否纳入当前阶段，不能在报告中静默扩大范围。

## 6. 当前下一步

1. 由项目所有者确认历史真实密钥、Session Secret 和 Encryption Master Key 是否已经全部轮换；
2. 轮换确认后关闭 P0-1 和 Phase 0；
3. Phase 1～4已完成，Phase 5工程闭环与盲评工具链完成，但真实模型质量盲评数据仍为部分完成；
4. Phase 7前端拆分、Workspace创建契约、全量质量门和Web/Electron交付边界已收口；
5. Phase 6完整工作流页、Checkpoint、幂等恢复和安全旧库迁移已完成；
6. 下一主线是按已冻结协议使用固定真实模型样例比较单 Agent、双 Agent、RAG和交叉评审，完成独立评分后再解盲；不凭角色数量宣称质量提升。其后再决定共享Checkpointer与PDF/DOCX范围。

## 7. 最终交付

[工程整改与开发总报告]()已经完成当前阶段的完整汇总，可直接用于答辩和开发交接。后续每完成一个问题或阶段，持续更新其中的当前结果、证据、风险和结论；未实现项必须写明依赖和验收条件，不保留“待填写”占位。

旧版 Phase 3～5 路线已保存在[历史归档]()，不再作为当前执行依据。
