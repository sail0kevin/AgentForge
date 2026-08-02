import type { DevelopmentReport, ProductUISpec } from "./contracts";

function bulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function evidenceMarkdown(spec: ProductUISpec) {
  return spec.evidence.map((item) => [
    `- **${item.repositoryName}** (${item.evidenceType})`,
    `  - 仓库：${item.repositoryUrl}`,
    `  - 版本：${item.commitOrTag}`,
    `  - 路径：${item.path}${item.locator ? ` · ${item.locator}` : ""}`,
    `  - 许可证：${item.license}`,
    `  - 复用策略：${item.reusePolicy}`,
    `  - 参考洞察：${item.insight}`,
  ].join("\n")).join("\n");
}

function traceabilityMarkdown(spec: ProductUISpec) {
  return spec.traceability.map((item) => [
    `- **${item.area} / ${item.status}**：${item.statement}`,
    `  - 来源：${item.sourceRefs.map((reference) => `${reference.sourceType}:${reference.refId}`).join("、")}`,
  ].join("\n")).join("\n");
}

export function renderProductUISpecMarkdown(report: DevelopmentReport, metadata: { generatedAt?: string } = {}) {
  const spec = report.productUISpec;
  if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");
  const generatedAt = metadata.generatedAt ?? "未提供";
  const pages = spec.pages.map((page) => [
    `### ${page.name} · ${page.route}`,
    `目的：${page.purpose}`,
    `主操作：${page.primaryAction}`,
    `区块：${page.sections.join("、")}`,
    `组件：${page.components.join("、")}`,
    `状态：${page.requiredStates.join("、")}`,
    "验收：",
    bulletList(page.acceptanceCriteria),
  ].join("\n")).join("\n\n");
  const components = spec.components.map((component) => [
    `### ${component.name}`,
    `职责：${component.responsibility}`,
    `变体：${component.variants.join("、")}`,
    `状态：${component.states.join("、")}`,
    `无障碍：${component.accessibility.join("；")}`,
  ].join("\n")).join("\n\n");
  const flows = spec.userFlows.map((flow) => [
    `### ${flow.name}`,
    `目标：${flow.goal}`,
    "步骤：",
    bulletList(flow.steps),
    `失败恢复：${flow.failureRecovery}`,
  ].join("\n")).join("\n\n");
  const tokens = spec.designDirection.tokens;
  return [
    `# ${spec.productName} · ${spec.designDirection.name}`,
    "",
    `- 规格版本：${spec.schemaVersion}`,
    `- 方案类型：${spec.solutionType}`,
    `- 生成时间：${generatedAt}`,
    `- 证据状态：${spec.evidenceStatus}`,
    "",
    "> 本文档是 AgentForge 已实现的规格导出能力生成的目标设计稿。页面和视觉结果只有在下游 AI 实际生成、运行并完成验收后，才能标记为已验证。",
    "",
    "## 产品定位",
    "",
    spec.productPositioning,
    "",
    "## 目标用户和场景",
    "",
    "目标用户：",
    bulletList(spec.targetUsers),
    "",
    "主要场景：",
    bulletList(spec.primaryScenarios),
    "",
    "## 页面清单",
    "",
    pages,
    "",
    "## 用户流程",
    "",
    flows,
    "",
    "## 设计方向",
    "",
    `名称：${spec.designDirection.name}`,
    `定位：${spec.designDirection.positioning}`,
    "视觉原则：",
    bulletList(spec.designDirection.visualPrinciples),
    `布局策略：${spec.designDirection.layoutStrategy}`,
    `组件策略：${spec.designDirection.componentStrategy}`,
    "避免：",
    bulletList(spec.designDirection.avoid),
    "",
    "### 设计 Token",
    `颜色：${tokens.colorStrategy}`,
    `字体：${tokens.typography}`,
    `间距：${tokens.spacing}`,
    `圆角：${tokens.radius}`,
    `层级：${tokens.elevation}`,
    `动效：${tokens.motion}`,
    "",
    "## 组件与交互状态",
    "",
    components,
    "",
    "交互状态：",
    bulletList(spec.interactionStates),
    "",
    "## 响应式要求",
    "",
    bulletList(spec.responsiveRules),
    "",
    "## 实现约束",
    "",
    bulletList(spec.implementationConstraints),
    "",
    "## 视觉验收标准",
    "",
    bulletList(spec.visualAcceptanceCriteria),
    "",
    "## 交付边界与来源映射",
    "",
    "### 本方案包含",
    bulletList(spec.deliveryBoundary.included),
    "",
    "### 本方案不包含",
    bulletList(spec.deliveryBoundary.excluded),
    "",
    `### 下游交接：${spec.deliveryBoundary.handoff}`,
    "",
    "### 可追溯映射",
    traceabilityMarkdown(spec),
    "",
    "## GitHub/UI 参考证据",
    "",
    evidenceMarkdown(spec),
    "",
    "## 当前状态声明",
    "",
    "- 已实现：AgentForge 可以生成并导出结构化产品/UI规格、页面清单、组件状态、响应式要求和下游 Prompt。",
    "- 已实现：每套规格保留 GitHub 仓库、版本字段、路径、许可证和复用策略。",
    "- 未验证：当前证据目录中的 main 分支版本尚未冻结 commit SHA，不能据此声称已完成版本审计。",
    "- 目标设计：页面、视觉风格、运行截图和最终网站效果需要由下游 AI 生成并经过实际运行验收。",
  ].join("\n");
}

export function buildDownstreamAgentPrompt(report: DevelopmentReport) {
  const spec = report.productUISpec;
  if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");
  const markdown = renderProductUISpecMarkdown(report);
  return [
    "你是负责把产品/UI实施规格落地为可运行网站的 AI 编程 Agent。",
    "请严格依据下面的规格实现页面，不要把目标设计描述成已经存在的功能，也不要编造截图、性能数字、召回率或测试结果。",
    "",
    "交付要求：",
    "1. 先实现页面路由、页面区块和主操作，再实现组件状态。",
    "2. 覆盖 loading、empty、error、success、权限和移动端状态。",
    "3. 让键盘操作、焦点管理、错误描述和非颜色语义可以被验收。",
    "4. 运行网站后输出实际使用的启动命令、页面截图路径和未通过的验收项。",
    "5. 不得把 GitHub 参考仓库整页复制到产品中；复用前检查许可证和固定版本。",
    "6. 先阅读“交付边界与来源映射”：status=implemented 表示 AgentForge 已有能力，status=target_design 表示你要实现的目标，status=verified 只表示来源已被结构化记录，status=unverified 必须在真实运行或版本审计后才能改变。",
    "",
    `方案 ID：${spec.solutionId}`,
    `方案类型：${spec.solutionType}`,
    "",
    markdown,
  ].join("\n");
}

export function renderProductUIReportGroupMarkdown(reports: DevelopmentReport[], metadata: { generatedAt?: string } = {}) {
  return reports.map((report) => renderProductUISpecMarkdown(report, metadata)).join("\n\n---\n\n");
}
