# AgentForge 文档索引
<!-- 文件名：2026-08-01 - document-index - 文档索引 -->

更新时间：2026-08-04（Asia/Shanghai）

本目录同时保存当前事实、正式设计、质量评测、公开说明、整改记录和历史材料。当前正式交付边界是 local-first Web MVP：用户需求经多 Agent 规划与评审后，可生成三套产品/UI实施报告（体验优先、视觉优先、工程优先），并完成报告组持久化、Markdown 导出、下游 AI 编程 Prompt 和真实验收反馈入口；网站本身仍由下游 AI 编程 Agent 生成，AgentForge 当前不宣称已自动生成真实网站。默认 GitHub/UI 参考已固定完整 commit SHA，但许可证复用审计、语义复核、真实模型盲评和 Electron 正式交付尚未完成。PostgreSQL Checkpointer、独立 migration 和分布式 lease/fencing 已实现，且已在 WSL 专用临时 PostgreSQL 环境完成迁移、跨实例恢复与租约/fencing 验收；Docker、远程 CI、目标环境备份恢复和生产负载仍待独立验证。

## 当前证据时间线

- 2026-07-19：历史收口结果，完整 `npm run quality:all` 通过；单元测试 `72/72`，核心 SQLite E2E `24/24`，Session 隔离 E2E `1/1`。
- 2026-08-01：历史完整门禁结果，单元测试 `193/193`，覆盖率和核心 E2E 结果见当前开发状态文档。
- 2026-08-02：历史聚焦验证通过 `208/208` Unit、`db:validate`、`db:validate:postgres`、TypeScript、ESLint 和 Next.js Production Build；当时未将结果冒充完整 E2E、真实 Provider 运行或 `quality:all`。
- 2026-08-03：最新完整 `npm run quality:all` 退出码为 `0`，通过 `211/211` Unit、`25/25` Core E2E、`1/1` Session E2E、`src/lib/**` 覆盖率行 `91.55%` / 分支 `86.85%` / 函数 `89.35%`、TypeScript、ESLint、51 份 Markdown 命名/本地链接校验和 Next.js Production Build；仓库检索仍是固定 6-case 冒烟验证。

上述时间线只记录已经执行的命令和结果。真实模型质量、人工 RAG Golden Set、目标环境 PostgreSQL 持久化、Docker/远程 CI、真实网站视觉验收和生产负载仍需独立证据。

## 推荐阅读顺序
## 2026-08-04 补充更新

- Product/UI 报告可导出单方案 `implementation-manifest` JSON，供下游 AI 编程工具或开发流程读取。
- 仓库已有三个可运行的报告映射案例：企业团队考勤工作台、数字艺术展览和数字聆听室；它们用于验证报告要素能够被实现消费。
- 案例不是“任意报告自动生成并部署网站”的证明。真实业务数据、生产部署、真实用户验收和许可证复用审计仍需独立完成。
- 新增 Product/UI 实施评测指南与实验包导出：它固定 Baseline/AgentForge 两条下游输入、管理员解盲映射和匿名评分材料；真实模型双分支输出与独立盲评仍待执行，不能据此宣称视觉质量提升。

建议先阅读：[Product/UI 实施包说明](./2026-08-04 - product-ui-implementation-manifest - AgentForge-implementation-manifest.md) 与 [数字聆听室案例说明](./2026-08-04 - generated-nocturne - AgentForge生成说明.md)。


1. [当前开发状态](./2026-08-01 - current-development-status - 当前开发状态.md)：当前实现、已知限制和最近验证结果的主入口。
2. [V2 证据基线](./2026-08-01 - v2-evidence-baseline - V2证据基线.md)：当前工作区无外部费用验证、P0 决策记录和待实测边界。
3. [当前运行架构](./2026-08-01 - current-runtime-architecture - 当前运行架构.md)：产品运行链路、离线质量链路和架构边界。
4. [架构总览](./architecture - 架构设计/2026-08-02 - architecture-overview - 架构总览.md)：交付主链路、状态图、证据链、持久化边界和已实现/目标设计区分。
5. [V2 工作流、检索与数据关系](./2026-08-01 - v2-workflow-retrieval-data-architecture - V2工作流检索与数据关系.md)：StateGraph、RAG、Prisma关系和CI门禁 Mermaid 图。
6. [V2 改进计划](./2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md)：P0-P2 优先级、依赖关系与目标设计。
7. [V2 测试计划](./2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md)：冻结实验、离线门禁与验收步骤。
8. [P0-2 PostgreSQL 验收状态](./2026-08-01 - p0-2-postgres-acceptance-status - P0-2PostgreSQL验收状态.md)：PostgreSQL 实现、实测条件与专用验收命令。
9. [本地演示指南](./2026-07-19 - local-demo-guide - 本地演示指南.md)：工作流、报告中心、统一工作台与质量命令的本地演示步骤。
10. [质量评测说明](./quality - 质量评测/2026-08-01 - quality-evaluation-index - 质量评测说明.md)：RAG回归、盲评命令、公开结果与本地私有材料的存放规则。
11. [真实模型盲评协议](./quality - 质量评测/2026-07-19 - blind-evaluation-protocol - 真实模型盲评协议.md)：12案例、5变体、60项运行、匿名评分和结论边界。
12. [正式设计入口](./design - 产品设计方案/旧 - design-index - 设计文档总入口.md)：产品边界、工作流和目标架构设计。
13. [完整工程整改与开发总报告](./remediation - 工程整改实施/2026-07-19 - final-report - 工程整改与开发总报告.md)：答辩级主报告。
14. [当前项目报告](./reports - 对外发布报告/2026-07-19 - project-report - 当前项目报告.md)：适合公开展示的精简报告。
15. [发布检查清单](./reports - 对外发布报告/旧 - publishing-checklist - 发布检查清单.md)：提交与GitHub发布前的安全、文档和质量门禁。
16. [截图说明](./screenshots/2026-07-19 - screenshot-index - 公开截图说明.md)：README公开截图的内容和安全边界。
17. [历史归档](./archive - 历史归档资料/2026-07-15 - archive-index - 历史归档说明.md)：已被新版本取代但需保留的材料。
18. [Product/UI 实施评测指南](./2026-08-04 - product-ui-implementation-evaluation - ProductUI实施评测指南.md)：双分支输入、运行验收、匿名盲评与结果边界。

## 日常阅读五份

不需要先读完所有历史材料。新开发者优先阅读：

1. `2026-08-01 - current-development-status - 当前开发状态.md`；
2. `2026-08-01 - v2-evidence-baseline - V2证据基线.md`；
3. `2026-08-01 - current-runtime-architecture - 当前运行架构.md`；
4. `architecture - 架构设计/2026-08-02 - architecture-overview - 架构总览.md`；
5. `2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md`；
6. `2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md`。

需要继续真实模型质量实验时，再读取质量评测目录；需要答辩或追溯整改过程时，再读取 `remediation - 工程整改实施/`、`reviews - 历史评审复查/` 和 `archive - 历史归档资料/`。

## 当前目录职责

| 位置 | 职责 | 状态要求 |
|---|---|---|
| `2026-08-01 - current-development-status - 当前开发状态.md` | 当前实现状态主入口 | 阶段交付后更新日期、验证与限制 |
| `2026-08-01 - v2-evidence-baseline - V2证据基线.md` | 当前 V2 证据快照 | 只记录当前复跑证据，不改写历史快照 |
| `2026-08-01 - current-runtime-architecture - 当前运行架构.md` | 当前运行架构与离线质量链 | 不写尚未接入或未经验证的能力 |
| `2026-07-19 - local-demo-guide - 本地演示指南.md` | 可复现本地演示 | 页面、命令和结果必须真实可用 |
| `quality - 质量评测/` | RAG与真实模型盲评材料 | 公开协议/汇总与本地私有材料分离 |
| `design - 产品设计方案/` | 正式目标设计 | 必须标注目标设计或原型状态 |
| `reviews - 历史评审复查/` | 带日期的阶段评审 | 保留历史，不回写为当前事实 |
| `remediation - 工程整改实施/` | 整改记录与答辩级总报告 | 阶段报告保留过程，总报告反映当前事实 |
| `reports - 对外发布报告/` | 公开项目报告与发布清单 | 不能夸大真实模型或生产能力 |
| `archive - 历史归档资料/` | 被取代的历史材料 | 不作为当前实施依据 |
| `screenshots/` | 审查后的公开截图 | 不含密钥、个人数据或本机路径 |

## 当前质量证据入口

统一门禁：

```bash
npm run quality:all
```

2026-07-19 的 `72/72` Unit、`24/24` Core E2E、`1/1` Session E2E 是历史发布快照；2026-08-01 的 `193/193` Unit、`24/24` Core E2E、`1/1` Session E2E 是历史完整门禁快照。2026-08-02 的 `208/208` Unit 是历史聚焦验证快照；2026-08-03 最新完整 `quality:all` 为 `211/211` Unit、`25/25` Core E2E、`1/1` Session E2E，并通过 `src/lib/**` 覆盖率行 `91.55%` / 分支 `86.85%` / 函数 `89.35%`、TypeScript、ESLint、51 份 Markdown 命名/本地链接校验和生产构建。完整边界见 [V2 证据基线](./2026-08-01 - v2-evidence-baseline - V2证据基线.md) 与 [内部试点交付计划](./2026-08-02 - internal-pilot-delivery-plan - 内部试点交付计划.md)；盲评 dry-run 只验证工具链，不是实际模型质量实验。

## 简历入口

- [简历项目描述](./2026-08-02 - resume-project-description - 简历项目描述.md)：可直接放入简历的精简版、详细职责、面试展开点，以及已实现/已验证/待实测/目标设计边界。

## 文档维护规则

## 内部试点

- [内部试点交付计划](./2026-08-02 - internal-pilot-delivery-plan - 内部试点交付计划.md)：当前可交付边界、进入/退出验收条件、数据记录要求和未完成承诺。
- [内部试点部署与运维 Runbook](./2026-08-02 - pilot-operations-runbook - 内部试点部署运维Runbook.md)：目标环境预检、数据库迁移、Checkpoint 初始化、备份恢复、启动、停止和回滚步骤。

1. 当前开发状态和带日期的 V2 证据基线共同构成当前事实入口；其他文档不得维护相互冲突的数字。
2. 每项“已实现”能力至少关联代码、自动测试或可复现步骤。
3. 目标设计进入主链路后，先更新当前状态和当前架构，再修改公开报告。
4. 带日期的历史评审不回写；事实变化通过当前状态、当前架构和总报告说明。
5. `local-only/` 保存真实运行原文、匿名包、私有解盲表、评分表和个人材料，不得提交。
6. 发布前运行 `npm run quality:all`、`git diff --check`，检查相对链接，并确认环境文件、数据库和测试产物未进入提交。
7. 不得把 TF-IDF 写成向量检索，不得把合成 dry-run 写成真实模型盲评，不得把 PostgreSQL 静态检查或跳过的集成测试写成运行时验收，不得把实验性 Electron 写成生产级交付。
