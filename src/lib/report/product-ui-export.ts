import type {
  DevelopmentReport,
  ProductUIReportGroup,
  ProductUIReportFeedback,
  ProductUIRuntimeEvidence,
  ProductUISpec,
} from "./contracts";

export const PRODUCT_UI_HANDOFF_SCHEMA_VERSION = 2 as const;

export type ProductUIHandoffContract = {
  requiredArtifacts: string[];
  runtimeEvidence: string[];
  statusRules: string[];
};

const PRODUCT_UI_HANDOFF_CONTRACT: ProductUIHandoffContract = {
  requiredArtifacts: [
    "可启动的网站源码或明确的代码变更说明",
    "实际使用的启动命令",
    "可访问的预览地址",
    "桌面端和移动端截图（若目标包含响应式页面）",
    "逐项验收结果与未通过项",
  ],
  runtimeEvidence: [
    "launchCommand 必须是本次真实运行使用的命令",
    "previewUrl 必须指向本次运行的可访问地址",
    "screenshotPaths 必须指向实际生成的截图文件",
    "verificationNotes 必须说明已检查的页面、流程、响应式和遗留问题",
  ],
  statusRules: [
    "pending 表示尚未完成真实运行验收，不能描述为网站已完成",
    "pass 只有在存在完整运行证据并确认验收通过后才能使用",
    "needs_revision 表示至少有一项验收不通过，必须保留问题说明",
  ],
};

export type ProductUIHandoffSolution = {
  solutionId: string;
  solutionType: ProductUISpec["solutionType"];
  evidenceStatus: ProductUISpec["evidenceStatus"];
  evidenceAuditStatus: ProductUISpec["evidenceAuditStatus"];
  runtimeAcceptance: {
    status: "pending" | "pass" | "needs_revision";
    note: string | null;
    checkedAt: string | null;
    hasRuntimeEvidence: boolean;
    runtimeEvidence: ProductUIRuntimeEvidence | null;
  };
  handoffContract: ProductUIHandoffContract;
  report: DevelopmentReport;
  // 完整报告是主交付物，复制或下载它即可交给下游 AI 编程工具。
  aiExecutionMarkdown: string;
  markdown: string;
  /** @deprecated 兼容旧消费者；不再作为独立核心产物展示。 */
  downstreamPrompt: string;
};

export type ProductUIHandoffBundle = {
  schemaVersion: typeof PRODUCT_UI_HANDOFF_SCHEMA_VERSION;
  handoffType: "agentforge_product_ui";
  generatedAt: string;
  groupId: string;
  requirement: string;
  status: ProductUIReportGroup["status"];
  selectedSolutionId: string | null;
  comparison: ProductUIReportGroup["comparison"];
  handoffContract: ProductUIHandoffContract;
  solutions: ProductUIHandoffSolution[];
};

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
    `  - 仓库核验：${item.repositoryVerification}`,
    `  - 路径核验：${item.pathVerification}`,
    `  - 许可证核验：${item.licenseVerification}`,
    `  - 参考洞察：${item.insight}`,
  ].join("\n")).join("\n");
}

function traceabilityMarkdown(spec: ProductUISpec) {
  return spec.traceability.map((item) => [
    `- **${item.area} / ${item.status}**：${item.statement}`,
    `  - 来源：${item.sourceRefs.map((reference) => `${reference.sourceType}:${reference.refId}`).join("、")}`,
  ].join("\n")).join("\n");
}

function executionContractMarkdown(spec: ProductUISpec) {
  const contract = spec.aiExecutionContract;
  if (!contract) {
    return [
      "目标：依据本报告实现可运行网站，并对页面、组件、响应式和验收标准逐项回传真实结果。",
      "",
      "执行顺序：",
      bulletList(["先实现路由和页面骨架", "再实现组件、视觉 Token 和交互状态", "最后运行网站并逐项验收"]),
      "",
      "真实性约束：",
      bulletList(["不得编造截图、预览地址、性能数字或测试结果", "没有运行证据时不得声称网站已经完成"]),
    ].join("\n");
  }
  return [
    `目标：${contract.objective}`,
    "",
    "交付要求：",
    bulletList(contract.outputRequirements),
    "",
    "实施顺序：",
    bulletList(contract.implementationOrder),
    "",
    "内容与证据要求：",
    bulletList(contract.contentRequirements),
    "",
    "禁止声明：",
    bulletList(contract.forbiddenClaims),
    "",
    "验证清单：",
    bulletList(contract.verificationChecklist),
  ].join("\n");
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
    page.implementationInstructions?.length ? "实施要求：\n" + bulletList(page.implementationInstructions) : "",
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
    `- 证据审计状态：${spec.evidenceAuditStatus}`,
    "",
    "> 本文档是 AgentForge 已实现的规格导出能力生成的目标设计稿。页面和视觉结果只有在下游 AI 实际生成、运行并完成验收后，才能标记为已验证。",
    "",
    "## 产品定位",
    "",
    spec.productPositioning,
    "",
    "## AI 执行契约",
    "",
    executionContractMarkdown(spec),
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
    "- 已实现：AgentForge 可以生成并导出结构化 AI 可执行产品/UI实施报告、页面清单、组件状态、响应式要求、证据和验收契约。",
    "- 已实现：每套规格保留 GitHub 仓库、版本字段、路径、许可证和复用策略。",
    "- 已实现：默认 GitHub/UI 参考使用完整 commit SHA，并分别记录仓库、路径和许可证核验状态。",
    `- 当前状态：${spec.evidenceStatus}；证据审计：${spec.evidenceAuditStatus}。固定 SHA 只保证引用快照可复现，不等于仓库、路径或许可证审计已经完成。`,
    "- 兼容入口：下游 Prompt 仍可生成，但它只是完整报告的适配包装，不是独立于报告之外的第二份核心交付物。",
    "- 目标设计：页面、视觉风格、运行截图和最终网站效果需要由下游 AI 生成并经过实际运行验收。",
  ].join("\n");
}

export function buildDownstreamAgentPrompt(report: DevelopmentReport) {
  const spec = report.productUISpec;
  if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");
  const markdown = renderProductUISpecMarkdown(report);
  return [
    "你是负责把 AgentForge AI 可执行产品/UI实施报告落地为可运行网站的 AI 编程 Agent。",
    "下面的完整报告就是实施输入；请直接依据报告实现，不要把目标设计描述成已经存在的功能，也不要编造截图、性能数字、召回率或测试结果。",
    "",
    "交付要求：",
    "1. 先实现页面路由、页面区块和主操作，再实现组件状态。",
    "2. 覆盖 loading、empty、error、success、权限和移动端状态。",
    "3. 让键盘操作、焦点管理、错误描述和非颜色语义可以被验收。",
    "4. 运行网站后输出实际使用的启动命令、页面截图路径和未通过的验收项。",
    "5. 不得把 GitHub 参考仓库整页复制到产品中；复用前检查许可证和固定版本。",
    "6. 固定 SHA 只保证引用快照可复现；只有仓库、路径和许可证核验均为 verified 时，才能把来源审计标记为 fully_verified。",
    "7. 先阅读“交付边界与来源映射”：status=implemented 表示 AgentForge 已有能力，status=target_design 表示你要实现的目标，status=verified 只表示来源已被结构化记录，status=unverified 必须在真实运行或版本审计后才能改变。",
    "8. 完成后必须回传真实交付证据；没有启动命令、预览地址和截图时，不得声称网站已经通过验收。",
    "",
    "回传交付证据（只能填写真实值，不得使用臆造结果）：",
    "```json",
    JSON.stringify({
      launchCommand: "<实际启动命令>",
      previewUrl: "<实际预览地址>",
      screenshotPaths: ["<实际截图路径>"],
      verificationNotes: ["<逐项记录已通过和未通过的验收项>"],
    }, null, 2),
    "```",
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

function latestFeedback(feedback: ProductUIReportFeedback[], solutionId: string) {
  return [...feedback].reverse().find((item) => item.solutionId === solutionId) ?? null;
}

function buildRuntimeAcceptance(feedback: ProductUIReportFeedback[], solutionId: string): ProductUIHandoffSolution["runtimeAcceptance"] {
  const item = latestFeedback(feedback, solutionId);
  // 只有文字反馈而没有启动命令、地址和截图时，不能把报告标成已通过。
  const status = item?.outcome === "pass" && !item.runtimeEvidence ? "pending" : item?.outcome ?? "pending";
  return {
    status,
    note: item?.note ?? null,
    checkedAt: item?.checkedAt ?? null,
    hasRuntimeEvidence: Boolean(item?.runtimeEvidence),
    runtimeEvidence: item?.runtimeEvidence ?? null,
  };
}

// JSON handoff 是给下游 AI 编程 Agent 消费的稳定边界；它只携带已保存的报告和验收证据。
export function buildProductUIHandoffBundle(
  group: ProductUIReportGroup,
  metadata: { generatedAt?: string; selectedSolutionId?: string | null } = {},
): ProductUIHandoffBundle {
  const selectedSolutionId = metadata.selectedSolutionId ?? null;
  const reports = selectedSolutionId
    ? group.reports.filter((report) => report.productUISpec?.solutionId === selectedSolutionId)
    : group.reports;
  if (selectedSolutionId && reports.length === 0) throw new Error("PRODUCT_UI_SOLUTION_NOT_FOUND");

  return {
    schemaVersion: PRODUCT_UI_HANDOFF_SCHEMA_VERSION,
    handoffType: "agentforge_product_ui",
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    groupId: group.groupId,
    requirement: group.requirement,
    status: group.status,
    selectedSolutionId,
    comparison: selectedSolutionId
      ? group.comparison.filter((item) => item.solutionId === selectedSolutionId)
      : group.comparison,
    handoffContract: PRODUCT_UI_HANDOFF_CONTRACT,
    solutions: reports.map((report) => {
      const spec = report.productUISpec;
      if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");
      return {
        solutionId: spec.solutionId,
        solutionType: spec.solutionType,
        evidenceStatus: spec.evidenceStatus,
        evidenceAuditStatus: spec.evidenceAuditStatus,
        runtimeAcceptance: buildRuntimeAcceptance(group.feedback, spec.solutionId),
        handoffContract: PRODUCT_UI_HANDOFF_CONTRACT,
        report,
        aiExecutionMarkdown: renderProductUISpecMarkdown(report, metadata),
        markdown: renderProductUISpecMarkdown(report, metadata),
        downstreamPrompt: buildDownstreamAgentPrompt(report),
      };
    }),
  };
}

export function renderProductUIHandoffJson(
  group: ProductUIReportGroup,
  metadata: { generatedAt?: string; selectedSolutionId?: string | null } = {},
) {
  return JSON.stringify(buildProductUIHandoffBundle(group, metadata), null, 2);
}
