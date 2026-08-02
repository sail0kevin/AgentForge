import {
  DevelopmentReportSchema,
  ProductUIReportGroupSchema,
  ProductUISpecSchema,
  type DevelopmentReport,
  type GitHubEvidence,
  type ProductUIReportGroup,
  type ProductUISolutionType,
  type ProductUISpec,
  type ProductUITraceability,
  type ReportSourceReference,
} from "./contracts";
import { DEFAULT_GITHUB_UI_EVIDENCE } from "./github-ui-evidence";
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

function traceability(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[]) {
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
    status: /[0-9a-f]{7,40}/i.test(item.commitOrTag) && !item.commitOrTag.includes("待冻结") ? "verified" as const : "unverified" as const,
    sourceRefs: [source("github_evidence", item.id, `${item.repositoryName} UI参考`, item.path)],
  })));
  items.push({
    id: "handoff-contract",
    area: "handoff",
    statement: "下游 AI 应将页面、流程、状态、设计 Token 和视觉验收标准实现为可运行网站，并回传启动命令、截图和未通过项。",
    status: "target_design",
    sourceRefs: [requirementSource, source("evaluation", input.reviewWorkflow.id, "Evaluator 评审结论")],
  });
  return items.slice(0, 40);
}

function commonPages(type: ProductUISolutionType) {
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
      components: ["SolutionTabs", "PageInventory", "DesignTokenPanel", "PromptExportButton"],
      acceptanceCriteria: ["三套方案可横向比较，且每套都能单独导出。", "导出内容包含页面、组件、响应式、状态和视觉验收要求。"],
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

function flow(type: ProductUISolutionType) {
  const suffix = type === "experience_first" ? "连续完成任务" : type === "visual_first" ? "比较结果并选择方向" : "确认实现边界";
  return [
    {
      id: "generate-ui-report",
      name: `从需求到${suffix}`,
      goal: "将一份需求转化为多套可交付给下游 AI 的产品/UI实施报告。",
      steps: ["提交需求和约束", "Planner 判断信息是否足够", "补充缺失信息并恢复流程", "生成并评审多套方案", "阅读报告和证据", "导出规格与下游 Prompt"],
      failureRecovery: "任何阶段失败都保留当前状态、失败原因和可重试入口；审批被拒绝时回到对应任务，而不是重新丢失整个流程。",
    },
  ];
}

function components(type: ProductUISolutionType) {
  const emphasis = type === "experience_first" ? "恢复动作" : type === "visual_first" ? "视觉层级" : "测试契约";
  return [
    { name: "RequirementEditor", responsibility: "收集需求、目标、约束和已知事实，并在提交前显示信息完整性。", variants: ["compact", "full"], states: ["idle", "dirty", "submitting", "invalid", "saved"], accessibility: ["提供关联 label 和错误描述", "支持键盘提交和恢复焦点"] },
    { name: "WorkflowStepper", responsibility: `呈现多 Agent 阶段、当前状态、证据入口和${emphasis}。`, variants: ["horizontal", "vertical"], states: ["pending", "running", "blocked", "completed", "needs_human"], accessibility: ["使用可读的状态文本", "当前阶段有 aria-current"] },
    { name: "CandidateComparison", responsibility: "并列展示交付、质量和产品/UI方案的目标、收益、代价和来源。", variants: ["table", "stacked"], states: ["loading", "ready", "empty", "error"], accessibility: ["表头与单元格关系明确", "方案选择不依赖颜色"] },
    { name: "EvidenceTable", responsibility: "展示知识库和 GitHub 参考证据的版本、路径、许可证、用途和验证状态。", variants: ["dense", "detail"], states: ["loading", "verified", "not_yet_verified", "license_review"], accessibility: ["支持键盘浏览", "长 URL 可复制且有文本标签"] },
    { name: "PromptExportButton", responsibility: "导出完整 UI 规格和下游 AI 编程 Prompt，并明确目标设计与未验证项。", variants: ["markdown", "json", "prompt"], states: ["idle", "generating", "ready", "blocked"], accessibility: ["提供下载结果的状态反馈", "失败时保留可重试入口"] },
  ];
}

export function createProductUISpec(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[] = input.githubEvidence ?? DEFAULT_GITHUB_UI_EVIDENCE): ProductUISpec {
  const spec = {
    schemaVersion: 1 as const,
    solutionId: `product-ui-${solutionType}`,
    solutionType,
    productName: productName(input),
    productPositioning: `这是基于当前需求和现有 AgentForge 工作流生成的${SOLUTION_LABELS[solutionType]}。它属于目标设计规格，不能表述为已经存在的页面或已验证的视觉结果。`,
    targetUsers: targetUsers(input),
    primaryScenarios: ["需求澄清和结构化规划", "多 Agent 方案评审", "人工审批与增量修改", "将报告交给下游 AI 生成网站或 UI", "运行页面后按视觉验收标准复核"],
    pages: commonPages(solutionType),
    userFlows: flow(solutionType),
    designDirection: designDirection(solutionType),
    components: components(solutionType),
    responsiveRules: ["桌面端使用稳定的两栏或三栏布局，内容区设置最大宽度，避免长行影响阅读。", "平板端收起次要侧栏，证据和目录改为可展开区域。", "移动端将流程、候选方案和验收清单改为纵向顺序，主操作固定在可见区域。", "表格在窄屏转换为带字段标签的堆叠行，不允许横向滚动隐藏关键操作。", "页面和组件使用稳定的尺寸约束，加载、错误和长文本状态不得造成布局跳动。"],
    interactionStates: ["初始化时显示当前阶段和可用操作，不展示假进度。", "模型调用中显示预算和取消入口，完成后明确产物版本。", "需求不完整时进入澄清状态，保留原始输入和待回答问题。", "评审发现高风险问题时，提供定向修改和人工确认路径。", "导出被阻止时说明缺失证据或验证状态，不生成看似完整的文件。", "权限不足时隐藏不可执行操作并说明需要的权限。"],
    implementationConstraints: ["报告内容必须区分事实、假设、目标设计、已验证项和未验证项。", "GitHub 参考必须记录仓库 URL、版本或待冻结状态、路径、许可证和复用策略。", "公开仓库只能作为参考，是否复用代码必须经过许可证和版本审计。", "下游 Prompt 不得编造页面截图、性能数字、召回率或视觉验收结果。", "每套方案必须独立生成唯一 solutionId，并保留自己的取舍和验收内容。", "实现时应优先复用项目现有组件、状态持久化、权限和可观测性边界。"],
    visualAcceptanceCriteria: ["首屏能识别产品目标、当前阶段和主要操作，且不需要阅读长段说明。", "所有页面都有 loading、empty、error、success 和移动端状态的实现或明确占位。", "用户可以从报告内容追溯到需求、计划、评审 Finding 或 GitHub 证据。", "组件交互有键盘路径、焦点可见性、错误描述和非颜色语义。", "运行生成的网站后，验收者可以按页面、流程、响应式和视觉层级逐项记录结果。", "没有真实截图或自动化检查结果时，界面不得宣称已经通过视觉验收。"],
    deliveryBoundary: {
      included: input.analysis.inScope.slice(0, 12).length > 0 ? input.analysis.inScope.slice(0, 12) : ["结构化产品/UI实施报告", "页面、流程和验收契约"],
      excluded: [...input.analysis.outOfScope.slice(0, 10), "下游网站的真实运行、截图和视觉验收结果"].slice(0, 20),
      handoff: "本规格是交给下游 AI 编程 Agent 的实施输入，不是已经上线的网站。下游完成实现后，必须回传真实启动命令、截图路径、测试结果和未通过的验收项。",
    },
    traceability: traceability(input, solutionType, evidence),
    evidence,
    evidenceStatus: evidence.some((item) => /[0-9a-f]{7,40}/i.test(item.commitOrTag) && !item.commitOrTag.includes("待冻结")) ? "sha_pinned" as const : "not_yet_verified" as const,
  };
  return ProductUISpecSchema.parse(spec);
}

function reportForSolution(input: ReportGenerationInput, solutionType: ProductUISolutionType, evidence: GitHubEvidence[]) {
  const base = createBaselineDevelopmentReport({ ...input, githubEvidence: evidence });
  const spec = createProductUISpec(input, solutionType, evidence);
  const report: DevelopmentReport = {
    ...base,
    title: `${base.title} · ${SOLUTION_LABELS[solutionType]}`,
    executiveSummary: `${base.executiveSummary} 本版本增加一套可交给下游 AI 编程 Agent 的产品/UI实施规格；当前页面、视觉方向和验收标准属于目标设计，GitHub 参考版本尚未冻结 SHA。`,
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
