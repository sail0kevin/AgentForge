# Web UI/UX 专业知识工具设计（部分实现）
<!-- 文件名：web-ui-ux-knowledge-tool-design - Web界面知识工具设计 -->
<!-- 所属目录：design - 产品设计方案 -->

> 状态：**部分实现。** 版本化本地文档检索和 `ui-acceptance-check` 基线已经实现；完整知识卡片库与专业规则集仍属目标设计。运行时不让模型随意搜索GitHub，而是使用受审查、可版本化和可追溯的本地知识。

## 1. 为什么这样做

运行时随机搜索仓库会带来质量、版本、许可、速率、Prompt Injection 和来源不可追溯问题。第一版应使用经过人工审核的规则、案例与引用，优先改善 AgentForge 的“简洁、美观、可解释”的 Web 界面建议。

## 2. 知识卡片

```ts
type KnowledgeRecord = {
  id: string;
  topic: string[];
  rule: string;
  rationale: string;
  whenToUse: string;
  antiPattern?: string;
  acceptanceChecks: string[];
  sourceUrl: string;
  sourceVersion?: string;
  reviewedAt: string;
  status: "normative" | "advisory" | "project-decision";
  reuseClass: "guidance-only" | "attributed-excerpt" | "reusable-code";
};
```

`normative` 只用于 WCAG 等标准；设计系统原则通常是 `advisory`；AgentForge 自己的取舍是 `project-decision`。

## 3. 首批实际知识

| 主题 | 写入工具的规则 |
|---|---|
| 信息层级 | 每页聚焦一个主任务和明确主操作，先展示结论、风险和下一步。 |
| Token | 建立 primitive → semantic → component 三层 token，不散落 hex、间距和圆角。 |
| 简洁性 | 卡片、边框、颜色、图标和动效只服务于分组、状态、优先级或操作。 |
| 状态 | loading、empty、success、warning、error、disabled、focus、selected、permission denied 都要有设计。 |
| 表单 | 可见标签、帮助文本、字段级错误和页级错误摘要；不能只用 placeholder 或颜色提示。 |
| 可访问性 | 语义控件、键盘、可见焦点、逻辑标题、对比度、状态公告和 reduced motion。 |
| AI 工作流 | 明确区分 Agent 生成、Tool 执行、部分失败、等待人工确认和最终结论。 |
| 多 Agent | 展示角色、阶段、输入依赖、finding、来源和裁决，避免黑盒。 |
| 危险操作 | 删除 Agent、清空对话、删除知识必须说明后果并要求确认。 |
| 响应式 | 窄屏按任务优先级重排，不只是缩小；核心内容不能依赖 hover 或横向滚动。 |

## 4. 首批可调用工具

```text
review_visual_hierarchy
recommend_layout_and_tokens
review_form_usability
review_accessibility
review_ai_workflow_ui
design_page_component_tree
generate_ui_acceptance_checks
```

例如 `review_accessibility` 输入页面结构、交互和状态，输出问题、优先级、依据、修改建议和验收项。它是本地规则/知识能力，不执行外部代码。

## 5. RAG 与 Tool Calling

- RAG：按查询取回知识卡片/资料片段，供 Agent 参考；
- Tool Calling：模型根据任务主动调用有 Schema 的能力，例如生成 UI 验收检查；
- 工具返回必须经过参数校验、调用次数限制、超时、来源记录和权限检查。

## 6. 来源与许可

来源包括 MUI、Material 3、Carbon、Spectrum、Primer、Radix、Fluent、USWDS、GOV.UK、W3C/WCAG、Apple HIG 和 NN/g，入口见 [references - 设计参考与许可说明.md](./2026-07-12 - design-references-and-license - 设计参考与许可说明.md)。

规则采用原创摘要，不复制文档全文、截图、Logo、字体或 Figma 文件。代码许可证、文档、图标、字体和品牌必须分别确认；开源组件不等于可以复用其全部品牌资产。

## 7. 当前页面落地与后续扩展

当前已落地统一工作台中的对话、Agent管理、知识/工具、看板和设置界面，以及独立的 `/workflows` 工作流页和 `/reports` 报告中心。页面职责为：

1. 对话入口：输入需求和运行自由多Agent对话；
2. 工作流页：展示节点、Tool、状态、失败、人工确认和恢复；
3. 报告中心：展示动态目录、决策、来源、版本和Markdown导出；
4. Agent管理：配置角色、模型、能力和凭证；
5. 知识/工具界面：管理文档来源、启用状态和当前受控能力。

后续扩展聚焦更完整的专业知识卡片、规则集和工具管理，不再把页面分离本身列为未来工作。

## 8. 验收

- 规则可追溯到来源和审查日期；
- Tool 不访问 GitHub、不执行外部代码；
- UI 有键盘流、焦点、错误、状态和窄屏验收；
- 以 WCAG 2.2 AA 为目标，结合自动检查与人工测试，未测前不宣称合规；
- 不混用多个设计系统视觉组件；如复用行为 primitives，统一由 AgentForge token 定义视觉。
