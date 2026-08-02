# Phase 3：需求分析、Planner 与结构化输出
<!-- 文件名：phase-3-planner-and-structured-output - Planner与结构化输出 -->
<!-- 所属目录：remediation - 工程整改实施 -->

阶段状态：已完成  
实施日期：2026-07-15  
完成时间：2026-07-15 18:26（Asia/Shanghai）  
对应问题：PLAN-1、PLAN-2、PLAN-3

## 1. 本阶段解决了什么

用白话说，过去系统能够让多个 Agent 依次回答问题，但它还不会先判断“用户到底要做什么、缺了哪些关键资料、应该让谁做哪些工作、最终报告应该有哪些章节”。这会让不同项目套用相似提示词，模型写出的内容也很难被程序可靠检查。

本阶段新增了真正的规划入口。用户提交需求后，系统先形成结构化需求分析；如果目标或用户等关键资料不足，就返回具体问题，而不是默默猜测；资料足够时，再生成带任务、依赖、Agent角色、工具、预算、评价维度和动态报告目录的执行计划。模型的输出只有通过 Zod格式校验和服务端语义校验，才会进入持久化结果。

## 2. 最终工作流

```text
已认证用户提交需求
  → 创建专属 Planner Workspace 与 Run
  → analyzeRequirement
      → 识别项目类型、目标用户、范围、约束、风险和缺失信息
      → 关键资料不足：返回 needs_clarification
  → createPlan
      → 生成任务、依赖、角色、工具、预算和动态报告目录
  → validatePlan
      → Zod Schema
      → Agent/Tool 白名单
      → 依赖存在性与 DAG 无环
      → 任务数、轮次、Token 和费用预算
      → Task 与 ReportSection 双向引用
  → 保存 PlanningArtifact 并关联同一个 runId/userId
  → 完成 Run；失败也保存稳定 failureCode
```

这里最重要的边界是：Planner 只能提出计划，服务端才有批准权。即使模型输出看起来合理，只要使用未授权工具、产生循环依赖、超预算或缺少必填字段，就不会被当作成功结果。

## 3. 数据契约

### 3.1 RequirementAnalysis

需求分析使用 `RequirementAnalysisSchema`，包含：

- `projectType`：website、admin、learning、ecommerce、dashboard、api 或 other；
- `summary`、`goals`、`targetUsers`；
- `inScope`、`outOfScope`、`constraints`、`assumptions`；
- `missingInformation`：问题、原因和是否必须回答；
- `risks`：风险级别与缓解方案；
- `complexity` 和 `schemaVersion: 1`。

把“假设”和“用户已确认事实”分开，是为了让报告以后能够解释哪些结论来自用户，哪些只是暂时推断。

### 3.2 ExecutionPlan

执行计划使用 `ExecutionPlanSchema`，包含：

- Task 的 ID、职责、说明、Agent角色、依赖、Tool、Token估计和目标报告章节；
- ReportSection 的 ID、标题、用途、顺序、必要性和来源任务；
- 评价维度、最大轮次、总 Token 和预计费用；
- `schemaVersion: 1`。

### 3.3 BudgetState

预算不仅是一个金额。当前契约同时限制：

- 最大 Token；
- 最大费用；
- 最大执行轮次；
- 最大任务数。

模型调用前还会按提示词和最大输出量估算本次调用费用。预计超过预算时，服务端在请求 Provider 之前停止，错误码为 `PLANNER_BUDGET_EXCEEDED`。

## 4. 动态报告目录

基线 Planner 不是固定目录复制器。它根据项目类型选择不同章节，例如：

| 项目类型 | 代表性章节 |
|---|---|
| 企业官网 | 信息架构与页面地图；视觉规范与响应式组件；内容、SEO与可访问性 |
| 管理后台 | 角色、权限与审计边界；后台业务流程与状态；数据模型与一致性规则 |
| 学习工具 | 学习者旅程与目标；计时与状态机设计；统计指标与学习反馈 |

电商、数据看板和 API 服务也有独立目录。每个章节都必须能追溯到至少一个任务，每个任务也必须声明它为哪些章节提供证据。

基线模式用于无模型成本的确定性规划、开发调试和自动化验收。传入当前用户拥有的 `plannerAgentId` 时，接口改用真实模型；两种模式共享同一契约、校验器、持久化和 Run 终态，不存在一套“测试规则”和另一套“真实规则”。

## 5. 有限结构化重试

模型可能返回 Markdown代码围栏、自由文本、字段缺失或语义非法的 JSON。`generateStructuredOutput` 的处理规则是：

1. 尝试解析纯 JSON 或单个 JSON代码围栏；
2. 用 Zod检查字段、类型和数量；
3. 计划额外执行服务端语义校验；
4. 把错误摘要反馈给下一次提示；
5. 默认最多两次，代码硬上限三次；
6. 仍不合法时抛出 `STRUCTURED_OUTPUT_INVALID`，绝不把自由文本冒充成功计划。

Prompt 中直接包含当前 Zod转换得到的机器可读 JSON Schema，并把稳定系统规则、运行需求、预算和上一步分析分开，减少契约与提示词漂移。

## 6. 持久化与认证边界

新增 `PlanningArtifact`：

- 以 `runId` 唯一关联 Run；
- 同时记录 `userId` 和可选 `plannerAgentId`；
- 保存需求、分析、执行计划、动态目录、补充问题和预算；
- 失败时保存 `status=failed` 与稳定 `failureCode`；
- 模型已经产生Token但结构化结果最终被拒绝时，保存失败assistant消息与TokenUsage，不把失败费用记成零；
- 删除 Run 时级联删除，删除 Agent 时只把 Planner Agent引用设为空；
- GET `/api/plans` 只查询当前登录用户的最近20条记录。

POST `/api/plans` 不接受浏览器传入任意 Agent配置或密钥，只接受当前用户拥有的 `plannerAgentId`。凭证仍在服务端解密，模型响应和返回 DTO 不包含 API Key。

## 7. 主要文件

| 文件 | 职责 |
|---|---|
| `src/lib/planner/contracts.ts` | 四类核心 Zod契约与补充问题契约 |
| `src/lib/planner/structured-output.ts` | JSON提取、有限重试和稳定失败 |
| `src/lib/planner/validation.ts` | 白名单、DAG、引用、数量和预算语义校验 |
| `src/lib/planner/baseline-planner.ts` | 确定性需求分析与按类型生成动态目录 |
| `src/lib/planner/prompts.ts` | 稳定规则、节点变量和机器可读 Schema |
| `src/lib/planner/planner-service.ts` | analyze、clarify、plan、validate主流程 |
| `src/lib/planner/prisma-planning.ts` | PlanningArtifact用户/Run归属与映射 |
| `src/app/api/plans/route.ts` | 认证 GET/POST、模型适配、成本和终态 |
| `prisma/migrations/20260715181000_add_planning_artifacts/` | 第三次 SQLite标准迁移 |

## 8. 测试证据

阶段完成时的结果：

| 验证 | 结果 | 证明内容 |
|---|---:|---|
| TypeScript | 通过 | 新契约、Prisma Client和 API类型一致 |
| Planner定向 ESLint | 通过 | 新增核心文件没有引入 lint错误 |
| 单元测试 | 33/33 | 其中 Planner 6项；动态目录、补充问题、非法计划、重试和 Prompt契约 |
| 核心 E2E | 15/15 | 新增 Planner持久化、补充终态、非法模型有限重试3项 |
| Session E2E | 1/1 | A的规划记录对B不可见，A重新登录后仍可读取 |
| SQLite迁移 | 3/3应用成功 | 空数据库可创建 PlanningArtifact及关系 |

E2E 第一次运行暴露了一个真实错误：Prisma关系被误放到 Workspace，生成的 Client会查询不存在的 `Workspace.planningArtifactId`，导致9项测试失败。修复为 `Run.planningArtifact` 后重新生成 Client并再次从空数据库应用全部迁移，15项核心 E2E全部通过。保留这段失败记录，是为了证明数据库关系确实经过运行验证，而不是只通过静态 Schema格式化。

## 9. 验收清单

- [x] 官网、管理后台和学习应用 fixture 生成不同且合理的报告目录；
- [x] 非法 Agent、Tool、循环依赖和超预算计划被拒绝；
- [x] 缺少关键输入时产生带原因的补充请求；
- [x] 同一运行的分析、计划、目录或失败状态关联同一 runId；
- [x] Schema重试有次数上限，失败不会伪装完成；
- [x] Planner API要求认证，并通过 userId隔离读取；
- [x] 模型调用复用服务端凭证、超时、取消和成本计算边界。

## 10. 阶段结论与下一步

Phase 3已完成。AgentForge现在不再只是“按顺序聊天”：它已经能够把自然语言需求转换为可检查、可追踪、可持久化的规划产物，并为后续报告选择动态章节。

下一阶段是 Phase 4：修复 Markdown切块和 TF-IDF召回问题，统一知识入口，初始化受控 Tool Registry，并让 Planner计划中的 `toolIds`真正对应可执行、可审计的能力。Phase 3只证明计划结构安全，不代表 Tool Calling、候选方案、交叉评审或最终报告生成已经完成。
