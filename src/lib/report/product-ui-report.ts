import {
  DevelopmentReportSchema,
  ProductUIReportGroupSchema,
  ProductUISpecSchema,
  type DevelopmentReport,
  type GitHubEvidence,
  type ProductUIReportGroup,
  type ProductUIAIExecutionContract,
  type ProductUIAcceptanceMatrixItem,
  type ProductUIComponent,
  type ProductUIDesignDecision,
  type ProductUIFlow,
  type ProductUIPage,
  type ProductUISolutionType,
  type ProductUISpec,
  type ProductUITraceability,
  type ReportSourceReference,
} from "./contracts";
import { DEFAULT_GITHUB_UI_EVIDENCE, deriveGitHubEvidenceAuditStatus, githubEvidenceAsSource, hasPinnedGitHubCommit, isGitHubEvidenceFullyVerified } from "./github-ui-evidence";
import { createBaselineDevelopmentReport, type ReportGenerationInput } from "./report-service";

const SOLUTION_TYPES: ProductUISolutionType[] = ["experience_first", "visual_first", "engineering_first"];

const SOLUTION_LABELS: Record<ProductUISolutionType, string> = {
  experience_first: "体验优先方案",
  visual_first: "视觉优先方案",
  engineering_first: "工程优先方案",
};

function productName(input: ReportGenerationInput) {
  const firstLine = input.requirement.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine && firstLine.length >= 4 && firstLine.length <= 120
    ? firstLine.replace(/^#+\s*/, "")
    : "AgentForge 需求到 UI 实施工作台";
}

function targetUsers(input: ReportGenerationInput) {
  const users = input.analysis.targetUsers.filter(Boolean).slice(0, 6);
  return users && users.length > 0 ? users : ["产品负责人", "设计师", "前端工程师", "下游 AI 编程 Agent"];
}

function source(sourceType: ReportSourceReference["sourceType"], refId: string, label: string, locator: string | null = null): ReportSourceReference {
  return { sourceType, refId, label, locator };
}

function selectedCandidate(input: ReportGenerationInput, solutionType: ProductUISolutionType) {
  const preferredOrientation = solutionType === "engineering_first" ? "quality" : "delivery";
  return input.reviewWorkflow.candidates.find((candidate) => candidate.orientation === preferredOrientation)
    ?? input.reviewWorkflow.candidates[0];
}

function traceability(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[], designDecisionItems: ProductUIDesignDecision[]) {
  const requirementSource = source("requirement", input.planningArtifactId, "原始需求与结构化需求分析");
  const candidate = selectedCandidate(input, solutionType);
  const candidateFinding = candidate
    ? input.reviewWorkflow.review.findings.find((finding) => finding.candidateId === candidate.id)
    : undefined;
  const items: ProductUITraceability[] = [
    ...input.analysis.goals.slice(0, 4).map((goal, index) => ({
      id: `requirement-goal-${index + 1}`,
      area: "requirement" as const,
      statement: `需求目标：${goal}`,
      status: "verified" as const,
      sourceRefs: [requirementSource],
    })),
    ...input.analysis.inScope.slice(0, 4).map((scope, index) => ({
      id: `scope-${index + 1}`,
      area: "scope" as const,
      statement: `本方案纳入交付范围：${scope}`,
      status: "target_design" as const,
      sourceRefs: [requirementSource],
    })),
    ...input.plan.tasks.slice(0, 4).map((task) => ({
      id: `plan-task-${task.id}`,
      area: "plan" as const,
      statement: `实施计划要求：${task.title}。${task.description}`,
      status: "implemented" as const,
      sourceRefs: [source("plan_task", task.id, `计划任务：${task.title}`)],
    })),
  ];

  if (candidate) {
    items.push({
      id: `review-candidate-${candidate.id}`,
      area: "review",
      statement: `本套${SOLUTION_LABELS[solutionType]}参考${candidate.title}：${candidate.summary}`,
      status: "verified",
      sourceRefs: [source("candidate", candidate.id, `候选方案：${candidate.title}`)],
    });
  }
  if (candidateFinding) {
    items.push({
      id: `review-finding-${candidateFinding.id}`,
      area: "review",
      statement: `评审约束：${candidateFinding.failureScenario} 建议：${candidateFinding.suggestion}`,
      status: "verified",
      sourceRefs: [source("finding", candidateFinding.id, `评审 Finding：${candidateFinding.category}`)],
    });
  }
  items.push(...input.knowledgeEvidence.slice(0, 4).map((item, index) => ({
    id: `knowledge-${index + 1}`,
    area: "knowledge" as const,
    statement: `知识库参考：${item.source.label}。该内容只作为设计决策依据，不代表已在目标网站中验证。`,
    status: "verified" as const,
    sourceRefs: [item.source],
  })));
  items.push(...evidence.slice(0, 8).map((item) => ({
    id: `github-${item.id}`,
    area: "github" as const,
    statement: `GitHub/UI参考：${item.repositoryName} 的 ${item.path}，洞察：${item.insight}`,
    status: isGitHubEvidenceFullyVerified(item) ? "verified" as const : "unverified" as const,
    sourceRefs: [source("github_evidence", item.id, `${item.repositoryName} UI参考`, item.path)],
  })));
  items.push({
    id: "handoff-contract",
    area: "handoff",
    statement: "下游 AI 应将页面、流程、状态、设计 Token 和视觉验收标准实现为可运行网站，并回传启动命令、截图和未通过项。",
    status: "target_design",
    sourceRefs: [requirementSource, source("evaluation", input.reviewWorkflow.id, "Evaluator 评审结论")],
  });
  items.push(...designDecisionItems.map((decision) => ({
    id: `design-decision-${decision.id}`,
    area: "design_decision" as const,
    statement: `设计决策：${decision.principle}。影响页面：${decision.appliesTo.pageIds.join("、")}；组件：${decision.appliesTo.componentNames.join("、")}；验收项：${decision.appliesTo.acceptanceIds.join("、")}。`,
    status: decision.status,
    sourceRefs: decision.sourceRefs,
  })));  return items.slice(0, 40);
}

// 将真实来源的洞察显式绑定到报告中的页面、组件和验收项，避免下游 Agent 只能从自然语言猜测设计依据的作用范围。
function designDecisions(
  input: ReportGenerationInput,
  evidence: GitHubEvidence[],
  pages: ProductUIPage[],
  componentList: ProductUIComponent[],
  acceptanceItems: ProductUIAcceptanceMatrixItem[],
): ProductUIDesignDecision[] {
  const availablePageIds = pages.map((page) => page.id);
  const availableComponentNames = componentList.map((component) => component.name);
  const availableAcceptanceIds = acceptanceItems.map((item) => item.id);
  const existing = (requested: string[], available: string[]) => {
    const selected = requested.filter((item) => available.includes(item));
    return selected.length > 0 ? selected : available.slice(0, 1);
  };
  const acceptanceFor = (pageIds: string[], componentNames: string[], preferred: string[]) => {
    const selected = [
      ...preferred.filter((id) => availableAcceptanceIds.includes(id)),
      ...acceptanceItems
        .filter((item) => (item.targetType === "page" && pageIds.includes(item.targetId)) || (item.targetType === "component" && componentNames.includes(item.targetId)))
        .map((item) => item.id),
    ];
    const uniqueIds = [...new Set(selected)].slice(0, 20);
    return uniqueIds.length > 0 ? uniqueIds : availableAcceptanceIds.slice(0, 1);
  };
  const templates: Record<GitHubEvidence["evidenceType"], { id: string; principle: string; rationale: string; pageIds: string[]; componentNames: string[]; acceptanceIds: string[] }> = {
    component_library: {
      id: "composable-component-boundaries",
      principle: "以可组合组件边界承载报告中的方案对比、证据展示和导出操作。",
      rationale: "组件库参考用于约束组件职责与组合方式；实现时应按当前产品任务重组，不复制来源仓库的整页界面。",
      pageIds: ["workspace", "results"],
      componentNames: ["CandidateComparison", "EvidenceTable", "ReportExportActions"],
      acceptanceIds: ["export-report-completeness"],
    },
    accessibility_primitive: {
      id: "accessible-interaction-primitives",
      principle: "审批、菜单、表单和导出交互应具备可键盘操作、焦点管理和语义反馈。",
      rationale: "无障碍交互原语参考用于约束复杂交互的键盘路径与语义行为，不能仅以颜色或视觉状态表达结果。",
      pageIds: ["home", "workspace", "results", "settings"],
      componentNames: ["RequirementEditor", "WorkflowStepper", "CandidateComparison", "EvidenceTable", "ReportExportActions"],
      acceptanceIds: ["accessibility-keyboard-and-semantics"],
    },
    design_system: {
      id: "data-dense-design-system",
      principle: "采用稳定的信息层级、表格与表单反馈模式承载结构化报告和运行配置。",
      rationale: "设计系统参考用于组织数据密集型页面、表单校验和状态反馈，不代表最终网站必须使用来源项目的视觉风格。",
      pageIds: ["home", "workspace", "results", "settings"],
      componentNames: ["RequirementEditor", "CandidateComparison", "EvidenceTable", "ReportExportActions"],
      acceptanceIds: ["responsive-global-layout"],
    },
    application_architecture: {
      id: "traceable-workflow-architecture",
      principle: "将工作流阶段、证据、导出和运行验收保留为可追溯的独立界面边界。",
      rationale: "应用架构参考用于规划可维护的状态、信息和导出边界；实际技术栈与实现方式仍需由下游项目验证。",
      pageIds: ["workspace", "results", "settings"],
      componentNames: ["WorkflowStepper", "EvidenceTable", "ReportExportActions"],
      acceptanceIds: ["export-report-completeness", "runtime-evidence-return"],
    },
    example_implementation: {
      id: "evidence-bounded-example-implementation",
      principle: "示例实现只用于验证布局和交互思路，页面必须依据当前报告重新实现并接受逐项验收。",
      rationale: "示例项目可帮助下游理解可运行界面的组织方式，但不能替代本项目的真实运行、截图和视觉验收证据。",
      pageIds: ["home", "workspace", "results", "settings"],
      componentNames: ["RequirementEditor", "WorkflowStepper", "CandidateComparison", "EvidenceTable", "ReportExportActions"],
      acceptanceIds: ["github-ui-evidence-boundary", "export-report-completeness", "runtime-evidence-return"],
    },
  };
  const decisions = Object.entries(templates).flatMap(([evidenceType, template]) => {
    const sourceRefs = evidence
      .filter((item) => item.evidenceType === evidenceType)
      .map(githubEvidenceAsSource)
      .slice(0, 8);
    if (sourceRefs.length === 0) return [];
    const pageIds = existing(template.pageIds, availablePageIds);
    const componentNames = existing(template.componentNames, availableComponentNames);
    return [{
      id: template.id,
      principle: template.principle,
      rationale: `${template.rationale} 参考来源：${sourceRefs.map((item) => item.label).join("、")}。`,
      appliesTo: {
        pageIds,
        componentNames,
        acceptanceIds: acceptanceFor(pageIds, componentNames, template.acceptanceIds),
      },
      status: "target_design" as const,
      sourceRefs,
    }];
  });
  const knowledgeRefs = input.knowledgeEvidence.map((item) => item.source).slice(0, 6);
  if (knowledgeRefs.length > 0) {
    const pageIds = existing(["workspace", "results"], availablePageIds);
    const componentNames = existing(["EvidenceTable", "ReportExportActions"], availableComponentNames);
    decisions.unshift({
      id: "knowledge-evidence-boundary",
      principle: "知识库内容应作为可追溯设计依据展示，并与最终运行结果和来源审计状态明确区分。",
      rationale: "知识库证据可以支持设计和实施判断，但不等同于下游网站已经实现、运行或通过视觉验收。",
      appliesTo: {
        pageIds,
        componentNames,
        acceptanceIds: acceptanceFor(pageIds, componentNames, ["github-ui-evidence-boundary", "export-report-completeness"]),
      },
      status: "target_design",
      sourceRefs: knowledgeRefs,
    });
  }
  return decisions.slice(0, 8);
}
function pageBlueprint(pageId: string, type: ProductUISolutionType) {
  const emphasis = type === "experience_first" ? "任务连续性" : type === "visual_first" ? "首屏层级" : "工程可测试性";
  const blueprints: Record<string, { layout: string; aboveFold: string[]; contentRules: string[]; interactionRules: string[] }> = {
    home: {
      layout: "顶部导航下方采用单一主任务区，需求编辑器占据首屏主体，约束表单和最近工作区作为次级内容顺序排列。",
      aboveFold: ["产品目标和当前入口", "需求输入编辑器", "提交需求并开始分析的主操作"],
      contentRules: ["保留用户粘贴的完整需求和草稿内容", "约束字段与需求输入保持同一上下文", "最近工作区不抢占主任务视觉层级"],
      interactionRules: ["提交期间锁定重复提交并显示可取消状态", "校验失败时定位到具体字段并保留输入", `界面优先保证${emphasis}，不以装饰性内容替代任务入口`],
    },
    workspace: {
      layout: "桌面端采用流程侧栏、当前任务主区和证据上下文区三栏布局；移动端按阶段、任务、决策顺序纵向排列。",
      aboveFold: ["当前工作流阶段和状态", "待处理问题或当前任务", "下一步操作和人工干预入口"],
      contentRules: ["Finding 必须显示来源、影响、建议和状态", "候选方案与当前阶段保持明确关联", "证据默认收起但可从结论直接展开"],
      interactionRules: ["阶段切换不能丢失当前产物版本", "审批和修改都显示保存状态并留下审计记录", "高风险 Finding 必须提供定向修改或人工确认动作"],
    },
    results: {
      layout: "以方案切换和报告内容为主轴，页面清单、设计 Token、证据和验收矩阵按决策顺序分段展示。",
      aboveFold: ["当前方案名称和适用取舍", "报告摘要与页面实施蓝图", "复制、Markdown 和 JSON 导出操作"],
      contentRules: ["每个页面显示路由、区块、组件、蓝图和状态", "目标设计与已验证证据使用不同状态标识", "验收矩阵可按稳定 ID 定位和复制"],
      interactionRules: ["切换方案时保留当前阅读位置或明确回到摘要", "导出前提示缺失证据和未验证项", "验收项详情支持记录真实证据路径和复现步骤"],
    },
    settings: {
      layout: "采用分组表单和证据表格布局，模型预算、证据审计和可观测性设置分别拥有清晰的保存边界。",
      aboveFold: ["当前运行配置摘要", "模型与预算设置", "证据审计状态和保存操作"],
      contentRules: ["GitHub 证据显示仓库、版本、路径、许可证和核验状态", "未完成审计的字段不得显示为 fully_verified", "保存失败时保留原配置和可重试入口"],
      interactionRules: ["危险或高成本设置需要明确确认", "保存状态区分未保存、保存中、已保存和失败", "权限不足时只读展示不可执行设置"],
    },
  };
  return blueprints[pageId];
}
function commonPages(type: ProductUISolutionType): ProductUIPage[] {
  const focus = type === "experience_first" ? "任务路径和失败恢复" : type === "visual_first" ? "首屏层级和结果呈现" : "组件复用和可测试状态";
  return [
    {
      id: "home",
      name: "需求入口",
      route: "/",
      purpose: "让用户提交产品需求并快速理解报告生成所需的输入范围。",
      primaryAction: "提交需求并开始分析",
      sections: ["需求输入", "约束与目标", "最近工作区"],
      requiredStates: ["loading", "empty", "error", "success", "mobile"],
      components: ["RequirementEditor", "ConstraintForm", "RecentWorkspaceList"],
      blueprint: pageBlueprint("home", type),
      implementationInstructions: ["首屏先呈现需求输入和目标约束，再展示最近工作区，不用装饰性首屏替代主要任务。", "输入区域需要支持粘贴长需求、保留草稿，并在提交失败后给出可执行修复建议。"],
      acceptanceCriteria: [`首屏明确${focus}，用户能在一次扫描内找到提交入口。`, "提交失败时保留已输入内容并给出可执行修复建议。"],
    },
    {
      id: "workspace",
      name: "协作工作区",
      route: "/workspace",
      purpose: "展示 Planner、方案 Agent、Reviewer 和 Evaluator 的结构化协作过程。",
      primaryAction: "补充信息或审批当前阶段",
      sections: ["流程状态", "当前问题", "候选方案", "人工决策"],
      requiredStates: ["loading", "empty", "error", "success", "permission_denied", "mobile"],
      components: ["WorkflowStepper", "FindingList", "CandidateComparison", "ApprovalPanel"],
      blueprint: pageBlueprint("workspace", type),
      implementationInstructions: ["把当前阶段、待处理问题和下一步操作放在首屏可见区域，证据作为可展开上下文。", "每个 Finding 都要显示来源、影响、建议动作和保存状态，人工审批后保留审计记录。"],
      acceptanceCriteria: ["每个阶段显示来源、状态和下一步操作。", "人工修改或审批后，界面能区分已保存与待提交状态。"],
    },
    {
      id: "results",
      name: "报告与 UI 规格",
      route: "/results",
      purpose: "阅读多套完整实施报告，并将选定规格交给下游 AI 生成网站或 UI。",
      primaryAction: "导出 UI 实施规格和下游 Prompt",
      sections: ["方案对比", "页面清单", "设计方向", "组件状态", "视觉验收"],
      requiredStates: ["loading", "empty", "error", "success", "mobile"],
      components: ["SolutionTabs", "PageInventory", "DesignTokenPanel", "ReportExportActions"],
      blueprint: pageBlueprint("results", type),
      implementationInstructions: ["把完整 AI 可执行报告作为主要内容，方案切换、复制和下载都围绕报告完成。", "页面清单、设计 Token、组件状态、证据和验收标准必须可以从结果页逐项查看。"],
      acceptanceCriteria: ["三套方案可横向比较，且每套都能单独导出完整 AI 可执行报告。", "导出内容包含页面、组件、响应式、状态、证据和视觉验收要求。"],
    },
    {
      id: "settings",
      name: "运行与证据设置",
      route: "/settings",
      purpose: "管理模型、预算、知识库证据和 GitHub UI 参考的审计状态。",
      primaryAction: "保存运行设置",
      sections: ["模型与预算", "证据目录", "许可证状态", "可观测性"],
      requiredStates: ["loading", "empty", "error", "success", "permission_denied", "mobile"],
      components: ["ModelSettings", "EvidenceTable", "LicenseStatus", "TelemetrySettings"],
      blueprint: pageBlueprint("settings", type),
      acceptanceCriteria: ["未冻结 SHA 的 GitHub 证据明确显示为未验证。", "保存失败时不丢失原有配置，也不伪造成功状态。"],
    },
  ];
}

function designDirection(type: ProductUISolutionType) {
  if (type === "experience_first") {
    return {
      name: "可恢复的工作流界面",
      positioning: "优先让用户持续完成需求澄清、评审和审批，而不是让复杂流程成为操作负担。",
      visualPrinciples: ["当前任务始终可见", "失败恢复优先于装饰", "信息按决策顺序展开", "关键操作有明确反馈"],
      layoutStrategy: "左侧显示流程阶段，中间聚焦当前任务，右侧保留证据和决策上下文；移动端改为纵向步骤流。",
      componentStrategy: "优先采用带状态的表单、步骤条、Finding 列表和审批面板，所有组件都能表达 loading、error 和恢复动作。",
      avoid: ["不可恢复的长表单", "把关键错误藏在 Toast 中", "只展示成功路径", "为了视觉效果牺牲证据可见性"],
      tokens: { colorStrategy: "中性背景配合蓝色进行进行中状态、绿色表示已验证、琥珀色表示待确认；颜色不单独承担语义。", typography: "正文使用易读的无衬线字体，标题控制在两级层次内，错误和状态文本保持足够对比度。", spacing: "采用 4px 基础间距，表单和步骤之间使用 16px 至 24px 的节奏。", radius: "控件使用 6px，分组区域使用 8px，避免过度圆角。", elevation: "只给浮层、审批面板和可交互候选方案使用低强度阴影。", motion: "阶段切换使用短时淡入，错误恢复不使用会隐藏信息的动画。" },
    };
  }
  if (type === "visual_first") {
    return {
      name: "高识别度的结果工作台",
      positioning: "优先建立产品识别度和报告结果的视觉层级，让用户一眼理解方案差异和交付价值。",
      visualPrinciples: ["首屏先给结果方向", "方案差异可被比较", "视觉节奏服务于阅读", "品牌表达不遮挡证据"],
      layoutStrategy: "结果页采用宽幅方案导航和分区阅读布局，报告详情以页面预览、Token 和验收清单形成连续阅读路径。",
      componentStrategy: "组件围绕方案卡片、页面目录、Token 展示和视觉验收清单组织，并保留明确的文本导出入口。",
      avoid: ["装饰性渐变遮挡内容", "把方案差异藏在折叠层", "只展示漂亮的成功状态", "使用未经证实的视觉效果数字"],
      tokens: { colorStrategy: "使用一组中性底色搭配单一品牌强调色和语义色，确保方案之间有稳定的对比而非随机换色。", typography: "结果标题使用紧凑的展示层级，正文和验收条目优先可扫描性，避免大段装饰性文案。", spacing: "结果分区使用 24px 至 32px 间距，卡片内部采用 12px 至 16px 间距。", radius: "方案容器使用 8px，按钮和输入控件使用 6px，维持克制的产品感。", elevation: "方案切换和当前选中状态依靠边框、背景和层级组合，阴影只用于浮层。", motion: "方案切换使用可感知但不拖慢阅读的 150ms 至 200ms 过渡。" },
    };
  }
  return {
    name: "可组合的工程化控制台",
    positioning: "优先保证页面结构、组件契约、响应式规则和测试状态可直接交给工程团队或下游 AI 实现。",
    visualPrinciples: ["契约先于装饰", "状态完整可测试", "组件边界清晰", "响应式规则明确"],
    layoutStrategy: "采用稳定的三栏桌面布局和单栏移动布局，页面结构以可复用区域和数据表格为主。",
    componentStrategy: "组件按输入、状态、输出和无障碍行为定义，优先复用成熟原语，并让每个组件拥有可独立验收的状态清单。",
    avoid: ["依赖隐式全局状态", "只定义桌面端布局", "把组件行为留给实现者猜测", "在未验证证据上固定版本结论"],
    tokens: { colorStrategy: "使用中性色作为基础，语义色表达状态，品牌色只用于主要操作和当前导航，保证设计 token 易于替换。", typography: "标题、正文、辅助文本和代码/标识使用明确层级，确保表格和配置内容在窄屏仍可读。", spacing: "使用 4px 间距基线，并在布局、组件和字段层分别定义稳定的间距档位。", radius: "基础控件 4px 至 6px，面板 8px，避免视觉层级因圆角过多而失焦。", elevation: "优先通过边框和背景层级区分区域，浮层只使用一档低强度阴影。", motion: "交互过渡保持可关闭、可预测和不影响自动化测试，减少非必要布局动画。" },
  };
}

function flow(type: ProductUISolutionType): ProductUIFlow[] {
  const suffix = type === "experience_first" ? "连续完成任务" : type === "visual_first" ? "比较结果并选择方向" : "确认实现边界";
  return [
    {
      id: "generate-ui-report",
      name: `从需求到${suffix}`,
      goal: "将一份需求转化为多套可交付给下游 AI 的产品/UI实施报告。",
      steps: ["提交需求和约束", "Planner 判断信息是否足够", "补充缺失信息并恢复流程", "生成并评审多套方案", "阅读报告和证据", "将完整报告交给下游 AI 实现网站"],
      failureRecovery: "任何阶段失败都保留当前状态、失败原因和可重试入口；审批被拒绝时回到对应任务，而不是重新丢失整个流程。",
    },
  ];
}

function components(type: ProductUISolutionType): ProductUIComponent[] {
  const emphasis = type === "experience_first" ? "恢复动作" : type === "visual_first" ? "视觉层级" : "测试契约";
  return [
    { name: "RequirementEditor", responsibility: "收集需求、目标、约束和已知事实，并在提交前显示信息完整性。", variants: ["compact", "full"], states: ["idle", "dirty", "submitting", "invalid", "saved"], accessibility: ["提供关联 label 和错误描述", "支持键盘提交和恢复焦点"] },
    { name: "WorkflowStepper", responsibility: `呈现多 Agent 阶段、当前状态、证据入口和${emphasis}。`, variants: ["horizontal", "vertical"], states: ["pending", "running", "blocked", "completed", "needs_human"], accessibility: ["使用可读的状态文本", "当前阶段有 aria-current"] },
    { name: "CandidateComparison", responsibility: "并列展示交付、质量和产品/UI方案的目标、收益、代价和来源。", variants: ["table", "stacked"], states: ["loading", "ready", "empty", "error"], accessibility: ["表头与单元格关系明确", "方案选择不依赖颜色"] },
    { name: "EvidenceTable", responsibility: "展示知识库和 GitHub 参考证据的版本、路径、许可证、用途和验证状态。", variants: ["dense", "detail"], states: ["loading", "verified", "not_yet_verified", "license_review"], accessibility: ["支持键盘浏览", "长 URL 可复制且有文本标签"] },
    { name: "ReportExportActions", responsibility: "复制或导出完整 AI 可执行产品/UI实施报告，并明确目标设计与未验证项。", variants: ["markdown", "json", "copy"], states: ["idle", "generating", "ready", "blocked"], accessibility: ["提供下载结果的状态反馈", "失败时保留可重试入口"] },
  ];
}

// 验收矩阵把页面、流程、组件和证据绑定到稳定 ID，方便下游 Agent 回传可核验结果。
function acceptanceMatrix(
  pages: ProductUIPage[],
  flows: ProductUIFlow[],
  componentList: ProductUIComponent[],
  responsiveRules: string[],
  evidence: GitHubEvidence[],
): ProductUIAcceptanceMatrixItem[] {
  const pageItems = pages.flatMap((page) => [
    {
      id: `page-${page.id}-structure`,
      targetType: "page" as const,
      targetId: page.id,
      criterion: `${page.name}必须实现路由、页面区块、主操作和报告中声明的必要状态。`,
      verificationMethod: `启动网站后访问${page.route}，逐项检查区块、主操作和${page.requiredStates.join("、")}状态。`,
      expectedEvidence: `记录${page.id}页面的预览地址、桌面端和移动端截图，以及失败状态的复现说明。`,
    },
    {
      id: `page-${page.id}-blueprint`,
      targetType: "page" as const,
      targetId: page.id,
      criterion: `${page.name}的首屏层级、内容规则和交互规则必须与页面蓝图一致。`,
      verificationMethod: "按页面蓝图逐条对照首屏、内容顺序和交互反馈，并记录不一致项。",
      expectedEvidence: "引用验收截图或录屏路径，并在verificationNotes中写入该稳定验收项ID。",
    },
  ]);
  const flowItems = flows.map((flow) => ({
    id: `flow-${flow.id}-completion`,
    targetType: "flow" as const,
    targetId: flow.id,
    criterion: `${flow.name}必须按报告步骤完成，并在失败时保留状态和恢复入口。`,
    verificationMethod: "从流程第一步开始执行至结束，再模拟失败或拒绝，检查是否能从当前状态恢复。",
    expectedEvidence: "记录流程各关键节点的截图、运行日志或自动化测试结果，并标注未通过步骤。",
  }));
  const componentItems = componentList.map((component) => ({
    id: `component-${component.name.toLowerCase()}-states`,
    targetType: "component" as const,
    targetId: component.name,
    criterion: `${component.name}必须实现报告声明的变体、状态和无障碍行为。`,
    verificationMethod: `在组件使用页面触发${component.states.join("、")}状态，并检查键盘操作和错误反馈。`,
    expectedEvidence: "提供组件状态截图或自动化测试结果，并在说明中引用该组件验收项ID。",
  }));
  return [
    ...pageItems,
    ...flowItems,
    ...componentItems,
    {
      id: "responsive-global-layout",
      targetType: "responsive" as const,
      targetId: "global",
      criterion: "桌面、平板和移动端都必须保持核心内容可读，主要操作可达且没有关键内容溢出。",
      verificationMethod: `在至少三种视口检查布局、长文本、表格、导航和主要操作；对照${responsiveRules.length}条响应式规则。`,
      expectedEvidence: "提供不同视口的真实截图或自动化检查结果，并记录发生溢出的页面和复现尺寸。",
    },
    {
      id: "accessibility-keyboard-and-semantics",
      targetType: "accessibility" as const,
      targetId: "global",
      criterion: "核心流程必须支持键盘访问、可见焦点、关联标签、错误描述和不依赖颜色的状态表达。",
      verificationMethod: "使用键盘完成核心流程，并检查焦点顺序、语义结构、标签关联和错误提示。",
      expectedEvidence: "记录键盘操作结果、自动化无障碍检查结果或明确的未通过复现步骤。",
    },
    {
      id: "github-ui-evidence-boundary",
      targetType: "evidence" as const,
      targetId: "github-ui",
      criterion: "GitHub/UI参考只能作为设计依据；复用代码前必须核对固定版本、路径和许可证状态。",
      verificationMethod: "逐条检查仓库地址、commit或tag、路径、许可证和三项独立核验状态。",
      expectedEvidence: evidence.length > 0
        ? "引用报告中的GitHub证据ID和核验字段；未完成核验时明确标记not_yet_verified。"
        : "记录没有可用GitHub证据的原因和后续补充路径。",
    },
    {
      id: "export-report-completeness",
      targetType: "export" as const,
      targetId: "product-ui-report",
      criterion: "导出的报告必须包含页面蓝图、用户流程、组件状态、响应式要求、证据边界和验收矩阵。",
      verificationMethod: "分别检查Markdown、JSON handoff和下游Prompt，确认稳定验收项ID未丢失。",
      expectedEvidence: "保存导出文件路径或内容校验结果，并列出缺失章节或字段。",
    },
    {
      id: "runtime-evidence-return",
      targetType: "runtime" as const,
      targetId: "downstream-website",
      criterion: "下游网站只有在真实启动、访问、截图和验收完成后才能标记为通过。",
      verificationMethod: "执行真实启动命令，访问预览地址，检查截图和verificationNotes中的验收项ID。",
      expectedEvidence: "必须回传launchCommand、previewUrl、screenshotPaths、测试结果和未通过项复现方式。",
    },
  ];
}
function aiExecutionContract(solutionType: ProductUISolutionType): ProductUIAIExecutionContract {
  const emphasis = solutionType === "experience_first" ? "任务连续性" : solutionType === "visual_first" ? "视觉识别度" : "工程可测试性";
  return {
    objective: `把本报告直接实现为可运行、可验收的网站或 UI 原型，重点保证${emphasis}，并让实现结果与页面、组件、证据和验收条目逐项对应。`,
    outputRequirements: [
      "先读取每个页面的 blueprint，按 layout、aboveFold、contentRules 和 interactionRules 实现页面，再补齐页面区块和主要用户流程。",
      "使用真实且与产品场景相关的界面文案和示例数据，不用 lorem ipsum 或与需求无关的占位内容。",
      "交付可启动的项目代码，并保留报告中要求的响应式、键盘操作和错误恢复行为。",
      "完成后按验收矩阵的稳定 ID 输出真实启动命令、预览地址、截图路径、测试结果和未通过的验收项。",
    ],
    implementationOrder: [
      "确认技术栈、入口路由和现有组件边界，记录无法满足的前置条件。",
      "实现页面骨架、导航和主流程，确保桌面端与移动端均可进入核心任务。",
      "实现设计 Token、组件变体、加载/空/错/成功状态和权限状态。",
      "根据视觉验收标准运行网站，逐页记录结果并修复高影响问题。",
      "回传 verificationNotes 时必须引用验收矩阵 ID；未通过项必须写明复现步骤、实际结果和证据路径。",
    ],
    contentRequirements: [
      "页面标题、按钮、字段、错误提示和空状态必须服务于当前需求，不得只生成抽象演示文案。",
      "GitHub/UI 参考只用于解释设计依据，复用代码前必须核对固定版本、路径和许可证。",
    ],
    forbiddenClaims: [
      "没有真实运行证据时，不得声称网站已经生成、上线或通过视觉验收。",
      "不得编造截图、预览地址、性能数字、召回率、测试结果或许可证审计结果。",
    ],
    verificationChecklist: [
      "逐页检查路由、页面区块、主要操作和关键状态。",
      "在桌面端和移动端检查布局、文字溢出、交互可达性和视觉层级。",
      "按验收矩阵稳定 ID 记录每一项通过、未通过或未验证结果；未通过项必须附复现方式和真实证据路径。",
    ],
  };
}

export function createProductUISpec(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[] = input.githubEvidence ?? DEFAULT_GITHUB_UI_EVIDENCE): ProductUISpec {
  const pages = commonPages(solutionType);
  const userFlows = flow(solutionType);
  const componentList = components(solutionType);
  const responsiveRules = [
    "桌面端使用稳定的两栏或三栏布局，内容区设置最大宽度，避免长行影响阅读。",
    "平板端收起次要侧栏，证据和目录改为可展开区域。",
    "移动端将流程、候选方案和验收清单改为纵向顺序，主操作固定在可见区域。",
    "表格在窄屏转换为带字段标签的堆叠行，不允许横向滚动隐藏关键操作。",
    "页面和组件使用稳定的尺寸约束，加载、错误和长文本状态不得造成布局跳动。",
  ];
  const acceptanceItems = acceptanceMatrix(pages, userFlows, componentList, responsiveRules, evidence);
  const designDecisionItems = designDecisions(input, evidence, pages, componentList, acceptanceItems);
  const spec = {
     schemaVersion: 1 as const,
    solutionId: `product-ui-${solutionType}`,
    solutionType,
    productName: productName(input),
    productPositioning: `这是基于当前需求和现有 AgentForge 工作流生成的${SOLUTION_LABELS[solutionType]}。它属于目标设计规格，不能表述为已经存在的页面或已验证的视觉结果。`,
    targetUsers: targetUsers(input),
    primaryScenarios: ["需求澄清和结构化规划", "多 Agent 方案评审", "人工审批与增量修改", "将报告交给下游 AI 生成网站或 UI", "运行页面后按视觉验收标准复核"],
    pages,
    userFlows,
    designDirection: designDirection(solutionType),
    components: componentList,
     responsiveRules,
    interactionStates: ["初始化时显示当前阶段和可用操作，不展示假进度。", "模型调用中显示预算和取消入口，完成后明确产物版本。", "需求不完整时进入澄清状态，保留原始输入和待回答问题。", "评审发现高风险问题时，提供定向修改和人工确认路径。", "导出被阻止时说明缺失证据或验证状态，不生成看似完整的文件。", "权限不足时隐藏不可执行操作并说明需要的权限。"],
     implementationConstraints: ["报告内容必须区分事实、假设、目标设计、已验证项和未验证项。", "GitHub 参考必须记录仓库 URL、commit SHA、路径、许可证、复用策略和三项独立核验状态；固定 SHA 只保证引用快照可复现，不代表仓库、路径或许可证已审计。", "公开仓库只能作为参考，是否复用代码必须经过许可证和版本审计。", "AI 执行报告不得编造页面截图、性能数字、召回率或视觉验收结果。", "每套方案必须独立生成唯一 solutionId，并保留自己的取舍和验收内容。", "实现时应优先复用项目现有组件、状态持久化、权限和可观测性边界。"],
    visualAcceptanceCriteria: ["首屏能识别产品目标、当前阶段和主要操作，且不需要阅读长段说明。", "所有页面都有 loading、empty、error、success 和移动端状态的实现或明确占位。", "用户可以从报告内容追溯到需求、计划、评审 Finding 或带固定 SHA 的 GitHub 证据。", "组件交互有键盘路径、焦点可见性、错误描述和非颜色语义。", "运行生成的网站后，验收者可以按页面、流程、响应式和视觉层级逐项记录结果。", "没有真实截图或自动化检查结果时，界面不得宣称已经通过视觉验收。"],
     deliveryBoundary: {
      included: input.analysis.inScope.slice(0, 12).length > 0 ? input.analysis.inScope.slice(0, 12) : ["结构化产品/UI实施报告", "页面、流程和验收契约"],
      excluded: [...input.analysis.outOfScope.slice(0, 10), "下游网站的真实运行、截图和视觉验收结果"].slice(0, 20),
      handoff: "本规格是交给下游 AI 编程 Agent 的实施输入，不是已经上线的网站。下游完成实现后，必须回传真实启动命令、截图路径、测试结果和未通过的验收项。",
     },
      acceptanceMatrix: acceptanceItems,
     aiExecutionContract: aiExecutionContract(solutionType),
    designDecisions: designDecisionItems,
    traceability: traceability(input, solutionType, evidence, designDecisionItems),
    evidence,
    evidenceStatus: evidence.length > 0 && evidence.every(hasPinnedGitHubCommit) ? "sha_pinned" as const : "not_yet_verified" as const,
    evidenceAuditStatus: deriveGitHubEvidenceAuditStatus(evidence),
  };
  return ProductUISpecSchema.parse(spec);
}

function reportForSolution(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[]) {
  const base = createBaselineDevelopmentReport({ ...input, githubEvidence: evidence });
  const spec = createProductUISpec(input, solutionType, evidence);
  const report: DevelopmentReport = {
    ...base,
    title: `${base.title} · ${SOLUTION_LABELS[solutionType]}`,
     executiveSummary: `${base.executiveSummary} 本版本将产品/UI实施报告定义为可直接交给下游 AI 编程 Agent 执行的核心交付物；报告包含页面、视觉、组件、交互、响应式、证据和验收契约。GitHub 参考的 commit SHA 用于固定可复现快照，仓库、路径和许可证核验状态独立记录；页面、视觉方向和验收标准仍属于目标设计，不代表下游网站已经生成或通过验收。`,
    productUISpec: spec,
  };
  return DevelopmentReportSchema.parse(report);
}

export function createProductUIReportGroup(input: ReportGenerationInput, options: { evidence?: GitHubEvidence[]; groupId?: string; solutionTypes?: ProductUISolutionType[] } = {}): ProductUIReportGroup {
  const evidence = options.evidence ?? input.githubEvidence ?? DEFAULT_GITHUB_UI_EVIDENCE;
  const solutionTypes = options.solutionTypes ?? SOLUTION_TYPES;
  const reports = solutionTypes.map((solutionType) => reportForSolution(input, solutionType, evidence));
  return ProductUIReportGroupSchema.parse({
    schemaVersion: 1,
    groupId: options.groupId ?? `product-ui-group-${crypto.randomUUID()}`,
    requirement: input.requirement,
    reports,
    comparison: reports.map((report) => {
      const spec = report.productUISpec!;
      return {
        solutionId: spec.solutionId,
        strengths: spec.designDirection.visualPrinciples.slice(0, 3),
        tradeoffs: spec.designDirection.avoid.slice(0, 3),
      };
    }),
  });
}
