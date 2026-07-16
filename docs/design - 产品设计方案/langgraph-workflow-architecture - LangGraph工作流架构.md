# LangGraph 工作流架构设计（目标设计）
<!-- 文件名：langgraph-workflow-architecture - LangGraph工作流架构 -->
<!-- 所属目录：design - 产品设计方案 -->

> 状态：**核心产品状态图已实现，扩展节点仍属目标设计。** 手动运行中的单个 Agent使用线性 LangGraph；`/workflows`已把 Planner、补充信息、Review/Evaluator、人工裁决、Reporter和ReportArtifact合并为支持持久Checkpoint、暂停、恢复和故障继续的产品图。独立retrieveKnowledge子图、Provider原生Tool Calling和共享Checkpointer仍待扩展。

## 1. 为什么引入 LangGraph

当前流程是固定的“需求分析师 → 报告负责人”，普通循环足够清晰。后续 Web 项目需求规划会出现分支、返工、工具调用、人工确认和中断恢复，使用 LangGraph 管理状态图比不断扩展 `for` 循环更可靠。

```text
用户需求
  → 需求理解
  → Planner 生成计划与动态报告目录
  → 校验计划
  → 调用专业知识工具
  → 候选方案 A / B
  → 交叉评审
  → 修订或人工确认
  → 动态开发方案
```

## 2. 目标边界

- 聚焦 **Web 项目需求规划与开发方案生成**；
- 不是自动写完整代码、自动部署或无限自主执行的平台；
- 报告目录由 Planner 根据需求选择，不固定为一套 13 章模板；
- 当前“大学生学习计划 Web 应用”可作为首个验收样例，不限制未来用户只能做这一类项目。

## 3. 状态与节点

```ts
type WorkflowState = {
  runId: string;
  threadId: string;
  userRequirement: string;
  requirementAnalysis?: RequirementAnalysis;
  plan?: ExecutionPlan;
  reportOutline?: ReportSection[];
  knowledge?: KnowledgeResult[];
  candidates?: CandidateSolution[];
  reviews?: ReviewResult[];
  finalReport?: DevelopmentReport;
  currentRound: number;
  maxRounds: number;
  budget: BudgetState;
  approval?: ApprovalState;
  errors: WorkflowError[];
};
```

首期节点：

1. `analyzeRequirement`：识别项目类型、范围、缺失信息和风险；
2. `createPlan`：输出受 Schema 限制的任务、Agent、工具和报告章节计划；
3. `validatePlan`：校验 Agent/工具白名单、任务数量、依赖、预算与轮次；
4. `retrieveKnowledge`：按计划调用本地专业知识工具；
5. `generateCandidates`：不同目标导向 Agent 独立提出方案；
6. `crossReview`：输出结构化问题与修订建议；
7. `evaluate`：按动态 rubric 判断达标、返工或人工确认；
8. `generateReport`：融合结果，输出动态章节报告；
9. `persistAndFinalize`：保存 artifact、消息、用量和最终状态。

## 4. 条件路由

```text
计划非法                → 重新规划或请求用户补充
缺少关键知识            → 检索工具
质量未达标且未超轮次    → 交叉审查/修订
存在关键取舍            → 人工确认
达到阈值或超过最大轮次  → 生成带风险说明的报告
```

所有循环必须同时受 `maxRounds`、Token/费用预算和超时限制。Planner 输出只能是建议；服务端必须校验后才允许执行。

## 5. 动态报告

Planner 输出允许章节集合，例如：

- 简单官网：页面结构、视觉方案、组件树、开发步骤、部署；
- 管理后台：用户角色、权限、数据模型、接口、测试；
- 学习计划 Web 应用：任务流、计时、统计、状态管理、数据模型、验收。

Reporter 依据 `reportOutline` 和最终 artifact 生成内容，并标注假设、风险、来源和待确认事项。

## 6. 与现有架构的关系

```text
现有：Route → 顺序 orchestrator → Provider router → Prisma + SSE
目标：Route → RunService → LangGraph → Model/Tool/Retriever adapters → Prisma + SSE
```

保留现有：认证、用户隔离、AES-256-GCM 凭证、Provider 路由语义、SSE 传输、Prisma、TF-IDF fallback 和 Playwright 基础。

新增：Run、Artifact、Review、RunEvent、Checkpoint 引用等领域实体。LangGraph checkpoint 用于恢复图状态；Prisma 用于产品查询、历史、审计和成本报表，两者不互相替代。

## 7. 事件与恢复

未来 SSE 在兼容现有事件的基础上增加：

```text
run_created / node_started / node_completed / tool_requested /
tool_completed / review_created / approval_required /
run_interrupted / run_resumed / artifact_created / run_cancelled
```

浏览器只接收脱敏后的业务事件，不接收 API Key、完整 checkpoint、原始 Provider 错误或无限上下文。

## 8. 分阶段实现

1. [已完成] 用 LangGraph单节点与 RunService保证 Agent顺序、失败、持久化和 SSE语义；
2. [已完成] 建立 Run、PlanningArtifact、ReviewWorkflow、ReportArtifact、DevelopmentWorkflow、WorkflowNode和Checkpoint引用；
3. [已完成] 加入 Planner、动态目录、版本化知识和受控只读 Tool；
4. [已完成] 加入候选方案、交叉评审、Evaluator和ReportArtifact；
5. [已完成] 人工确认、补充信息、产品级暂停、恢复、Checkpoint和异常继续。

## 9. 验收标准

- 同一 fixture 下 legacy 与 LangGraph 顺序流的事件和持久化语义一致；
- 不同用户、run、thread 的状态与凭证完全隔离；
- 中断恢复不重复入库、重复收费或重复执行副作用；
- Planner、工具参数、候选方案和报告全部经过结构化校验；
- 任意循环在预算、超时或最大轮次下可终止；
- UI 可解释当前节点、来源、失败、审批和最终报告边界。
