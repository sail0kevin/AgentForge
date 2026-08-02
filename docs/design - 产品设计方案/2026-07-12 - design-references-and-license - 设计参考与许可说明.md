# AgentForge 来源与许可说明
<!-- 文件名：references - 设计参考与许可说明 -->
<!-- 所属目录：design - 产品设计方案 -->

更新时间：2026-07-12。本文保存设计报告的外部参考入口；运行时不会抓取这些站点或 GitHub 仓库。

## 使用规则

1. 外部来源用于人工筛选、原创摘要和设计决策，不复制整篇文档、截图、图标或设计文件。
2. 开源代码许可证不自动覆盖文档、品牌、Logo、字体、Figma 资源和第三方素材。
3. 引入任何第三方代码或资产前，必须核对目标版本的 `LICENSE`、`NOTICE` 和资产条款。
4. WCAG 条目以标准编号和原始链接引用；项目只能写“以 WCAG 2.2 AA 为验收目标”，不能在未测试前宣称完全合规。

## LangChain 与 LangGraph

| ID | 来源 | 用途 | 许可/注意事项 |
|---|---|---|---|
| LC-01 | [LangChain JS](https://github.com/langchain-ai/langchainjs) | JS/TS 组件与工具实现参考 | 仓库代码以目标版本 LICENSE 为准。 |
| LC-02 | [LangChain JS 文档](https://docs.langchain.com/oss/javascript/) | Prompt、模型、结构化输出、RAG、Tool Calling | API 会变化，实现前核对安装版本。 |
| LG-01 | [LangGraph JS](https://github.com/langchain-ai/langgraphjs) | 图状态、节点、边和持久化 | 锁定版本并核对 LICENSE。 |
| LG-02 | [LangGraph JS 文档](https://langchain-ai.github.io/langgraphjs/) | Graph、streaming、interrupt、persistence 概念 | 以当前安装版本的类型定义为准。 |

## 可访问性与可用性

| ID | 来源 | 可提炼知识 |
|---|---|---|
| A11Y-01 | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 对比度、键盘、焦点、标签、错误、状态消息等可测试准则。 |
| A11Y-02 | [W3C WAI](https://www.w3.org/WAI/fundamentals/accessibility-intro/) | 可访问性应进入设计与开发全过程。 |
| UX-01 | [NN/g 十项可用性启发式](https://www.nngroup.com/articles/ten-usability-heuristics/) | 状态可见、错误预防、用户控制、一致性、识别优于回忆。 |
| UX-02 | [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/) | 层级、反馈、一致性和控件语义。 |

NN/g 和 Apple 内容用于原创概括与链接，不复制文章、图片或品牌素材。

## 设计系统与交互组件

| ID | 来源 | 可提炼知识 | 许可边界 |
|---|---|---|---|
| DS-01 | [MUI](https://github.com/mui/material-ui) | 组件状态、theme、响应式与 composition | 代码以仓库 LICENSE 为准；品牌、文档、Google 资产另行核对。 |
| DS-02 | [Material 3](https://m3.material.io/) | 语义色、层级、状态、适应式布局 | 作为设计指导；Google 品牌与资源不可默认复用。 |
| DS-03 | [Carbon](https://github.com/carbon-design-system/carbon) | 网格、密度、表单和数据密集界面 | 代码以 Apache-2.0 目标版本为准；IBM 品牌/字体单独核对。 |
| DS-04 | [React Spectrum](https://github.com/adobe/react-spectrum) | 无障碍组件行为、焦点和键盘模式 | 代码与 Adobe 设计资源、商标、字体分开核验。 |
| DS-05 | [Primer](https://github.com/primer/react) | tokens、组件状态和信息密度 | 不复用 GitHub 品牌/截图。 |
| DS-06 | [Radix Primitives](https://github.com/radix-ui/primitives) | 无样式、可访问交互 primitives | 适合复用行为，不要求复刻视觉。 |
| DS-07 | [Fluent UI](https://github.com/microsoft/fluentui) | tokens、布局、可访问组件模式 | 不暗示 Microsoft 背书。 |
| DS-08 | [USWDS](https://github.com/uswds/uswds) | 清晰表单、错误、导航和任务导向布局 | 核对代码 LICENSE 与资产许可证，不复用政府标识。 |
| DS-09 | [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) | 渐进披露、错误摘要、服务表单模式 | 代码与政府徽标/内容授权分开处理。 |

## 本项目的设计决策

本项目将上述来源转化为本地知识卡片和检查项。知识卡片中的规则属于 `normative`、`advisory` 或 `project-decision` 三种状态之一；只有 WCAG 等标准条目可被标记为规范性依据。其他来源是设计参考，不是自动适用的强制规则。
