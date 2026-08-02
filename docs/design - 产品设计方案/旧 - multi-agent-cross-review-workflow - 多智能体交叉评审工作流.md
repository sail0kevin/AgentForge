# 多 Agent 交叉评审工作流（部分实现）
<!-- 文件名：multi-agent-cross-review-workflow - 多智能体交叉评审工作流 -->
<!-- 所属目录：design - 产品设计方案 -->

> 状态：**工程实现完成，质量实验部分完成。** 独立候选、结构化 Finding、Evaluator、有限修订、失败降级、ReviewWorkflow、人工裁决、Reporter/ReportArtifact、报告中心、产品工作流调度和Checkpoint均已实现并通过测试；外部真实模型盲评尚未完成。当前事实见[Phase 5报告](../remediation - 工程整改实施/2026-07-15 - phase-5-cross-review-and-evaluation - 交叉评审与评价.md)、[Phase 6报告](../remediation - 工程整改实施/2026-07-15 - phase-6-dynamic-report-and-ui - 动态报告与产品界面.md)与[Checkpoint专题](../remediation - 工程整改实施/2026-07-15 - phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md)。

## 目标

评审不是让多个 Agent 无限聊天，而是报告生成中的质量控制步骤：独立提出方案、发现缺口、定点修订、按规则收敛。

```text
需求与计划
  → 候选 A：交付导向
  → 候选 B：质量导向
  → Reviewer：交叉审查
  → 修订一次
  → Evaluator：评分与取舍
  → Reporter：融合为最终报告
```

## 角色边界

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| Planner | 定义目标、约束、评价维度 | 直接宣布方案正确 |
| Proposer | 独立生成候选方案 | 评价自己的胜负 |
| Reviewer | 找缺口、风险、反例并给出证据 | 重写整份方案 |
| Evaluator | 用 rubric 做采纳/拒绝/未决决策 | 以多数投票替代证据 |
| Reporter | 融合优点、写清取舍 | 隐藏风险和来源 |
| Human | 处理高影响或不可解取舍 | 被模型静默替代 |

## 数据契约

```ts
type Finding = {
  id: string;
  candidateId: string;
  severity: "blocking" | "high" | "medium" | "low";
  category: string;
  failureScenario: string;
  evidenceRefs: string[];
  suggestion: string;
  relatedCandidateIds: string[];
};

type ReviewResult = {
  schemaVersion: 1;
  findings: Finding[];
};
```

每条 finding 必须指出具体失败场景和证据；没有证据的“我觉得不够好”不能自动阻断。

## 工作流规则

1. 候选方案先独立生成，不先看对方结果，减少锚定；
2. Reviewer 只接收原始需求、计划、候选 artifact、知识来源和 rubric；
3. 修订由预算限制为0～2轮，默认一轮；
4. Evaluator 的基础维度为需求覆盖、可行性、成本、可维护性、可测试性，Planner 可增加 SEO、权限、性能等任务特定维度；
5. `blocking`、预算耗尽、无新增高价值 finding、达到最大轮次或用户取消都会终止循环；
6. 无法自动解决的高优先级冲突进入人工确认。

## LangGraph 路由

```text
validate → generate A/B → crossReview → evaluate
                                    ↓
                未达标且未超限 → revise → validate
                                    ↓
                       达标/超限 → report
                       关键冲突 → humanApproval
```

## 防线

- 不用同一 Prompt 的多个回答假装独立验证；
- 不让选手兼任裁判；
- 不把模型共识当成事实；
- 不将原始长推理直接展示给用户；
- 不允许无限修订；
- 不让评审 Agent 直接执行外部写操作。

## 验收

- 两个候选出现冲突时，报告可说明取舍；
- 单个 Agent 失败时，最终状态是“部分完成/不可裁决”，不是伪造完成；
- 无证据 finding 不自动胜出；
- 最大轮次与预算必定终止；
- UI 展示结论、关键 finding、来源与人工决定，并可按需展开细节。
