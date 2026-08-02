import { AgentRoleSchema, type BudgetState, type ExecutionPlan, type RequirementAnalysis } from "./contracts";
import type { z } from "zod";

type AgentRole = z.infer<typeof AgentRoleSchema>;

const PROJECT_PATTERNS: Array<[RequirementAnalysis["projectType"], RegExp]> = [
  ["learning", /学习|课程|学生|教学|计时|番茄钟|study|course/i],
  ["admin", /管理后台|后台管理|权限|角色管理|admin|rbac/i],
  ["ecommerce", /电商|商城|商品|购物车|订单|支付|e-?commerce/i],
  ["dashboard", /数据大屏|仪表盘|看板|dashboard|可视化/i],
  ["api", /开放平台|接口服务|api\b|webhook/i],
  ["website", /官网|企业站|品牌站|落地页|门户|website|landing/i],
];

function projectTypeOf(requirement: string): RequirementAnalysis["projectType"] {
  return PROJECT_PATTERNS.find(([, pattern]) => pattern.test(requirement))?.[0] ?? "other";
}

function profileFor(type: RequirementAnalysis["projectType"]) {
  const profiles = {
    website: { users: ["网站访客", "内容运营人员"], scope: ["信息架构与页面导航", "核心页面与响应式界面", "内容发布、SEO 与可访问性", "上线与监测方案"], risk: "内容、品牌素材和页面范围不清会造成反复返工。" },
    admin: { users: ["业务管理员", "系统管理员"], scope: ["角色与权限模型", "核心业务数据管理", "后台操作流程与审计", "接口、前端与测试方案"], risk: "权限边界或数据口径不清可能引发越权与错误操作。" },
    learning: { users: ["学习者", "学习内容管理者"], scope: ["学习目标与任务管理", "计时、进度与状态流转", "学习统计与反馈", "数据、接口与验收方案"], risk: "学习状态、计时规则和统计口径不一致会让结果失真。" },
    ecommerce: { users: ["消费者", "商品与订单运营人员"], scope: ["商品浏览与检索", "购物车、下单和支付", "订单与售后管理", "安全、测试与上线方案"], risk: "支付、库存和订单状态不一致会造成资金或履约风险。" },
    dashboard: { users: ["业务决策者", "数据运营人员"], scope: ["指标口径与数据来源", "看板布局与交互", "查询、筛选和权限", "性能、测试与发布方案"], risk: "指标口径或数据更新周期不明确会导致错误决策。" },
    api: { users: ["接口调用方", "平台运维人员"], scope: ["资源与接口边界", "认证、授权与限流", "错误、版本和兼容策略", "测试、监控与发布方案"], risk: "契约、权限或兼容策略不清会影响所有调用方。" },
    other: { users: ["目标用户（待进一步确认）"], scope: ["业务目标与范围", "核心用户流程", "系统结构与数据", "测试与交付方案"], risk: "项目类型和核心流程不清会让方案缺少针对性。" },
  } satisfies Record<RequirementAnalysis["projectType"], { users: string[]; scope: string[]; risk: string }>;
  return profiles[type];
}

export function analyzeRequirementBaseline(requirement: string): RequirementAnalysis {
  const normalized = requirement.trim();
  const projectType = projectTypeOf(normalized);
  const profile = profileFor(projectType);
  const hasGoal = /希望|需要|建设|开发|制作|做一个|实现|目标|用于|want|build|need/i.test(normalized);
  const hasAudience = /用户|访客|客户|管理员|学生|学习者|教师|运营|员工|团队|面向|供.+使用|user|customer|student|admin/i.test(normalized);
  const missingInformation: RequirementAnalysis["missingInformation"] = [];
  if (normalized.length < 20 || !hasGoal) missingInformation.push({ id: "business-goal", question: "这个项目最重要的业务目标和成功标准是什么？", reason: "目标决定功能优先级，也决定报告应如何评价方案。", required: true });
  if (!hasAudience) missingInformation.push({ id: "target-users", question: "主要使用者是谁，他们最常完成什么任务？", reason: "用户类型会影响流程、权限、界面和验收标准。", required: true });

  const constraints = [
    /移动端|手机|响应式|mobile/i.test(normalized) ? "需要兼顾移动端或响应式体验" : null,
    /本地|离线|local|offline/i.test(normalized) ? "包含本地运行或离线使用要求" : null,
    /预算|成本|cost/i.test(normalized) ? "需要控制实施或运行成本" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    schemaVersion: 1,
    projectType,
    summary: normalized.length >= 10 ? normalized.slice(0, 1_000) : `用户希望规划一个 ${projectType} 类型的 Web 项目，但当前描述仍不完整。`,
    goals: hasGoal ? [normalized.slice(0, 300)] : ["明确项目目标、核心流程和可验收的交付边界"],
    targetUsers: hasAudience ? profile.users : ["目标用户（待用户确认）"],
    inScope: profile.scope,
    outOfScope: ["未经确认的自动部署与生产环境运维", "需求之外的原生客户端开发"],
    constraints,
    assumptions: ["当前阶段输出产品/UI实施报告和下游 Prompt，不直接替用户执行生产部署"],
    missingInformation,
    risks: [{ id: `${projectType}-scope-risk`, description: profile.risk, severity: "medium", mitigation: "在计划执行前确认关键问题，并在报告中记录依据、假设与验收口径。" }],
    complexity: normalized.length > 300 ? "high" : normalized.length > 80 ? "medium" : "low",
  };
}

type SectionDefinition = { id: string; title: string; purpose: string; role: AgentRole };

const SECTION_DEFINITIONS: Record<RequirementAnalysis["projectType"], SectionDefinition[]> = {
  website: [
    { id: "goals-audience", title: "项目目标与受众分析", purpose: "解释网站为何建设、服务谁以及如何判断成功。", role: "requirements" },
    { id: "information-architecture", title: "信息架构与页面地图", purpose: "定义栏目、页面层级、导航和内容关系。", role: "architecture" },
    { id: "visual-components", title: "视觉规范与响应式组件", purpose: "描述页面布局、组件系统和多端适配策略。", role: "frontend" },
    { id: "content-seo", title: "内容、SEO 与可访问性", purpose: "规划内容生产、搜索可见性和无障碍要求。", role: "reporter" },
    { id: "delivery-observability", title: "上线、监测与迭代", purpose: "给出发布、分析、监控和持续优化路径。", role: "testing" },
  ],
  admin: [
    { id: "roles-permissions", title: "角色、权限与审计边界", purpose: "定义谁能查看或修改哪些业务数据。", role: "security" },
    { id: "business-workflows", title: "后台业务流程与状态", purpose: "梳理高频操作、异常分支和状态流转。", role: "requirements" },
    { id: "data-model", title: "数据模型与一致性规则", purpose: "明确实体、关系、约束和审计字段。", role: "data" },
    { id: "api-frontend", title: "接口契约与后台前端", purpose: "规划 API、表格表单、查询筛选和交互反馈。", role: "backend" },
    { id: "security-acceptance", title: "安全、测试与验收", purpose: "覆盖越权、误操作、并发和回归验证。", role: "testing" },
  ],
  learning: [
    { id: "learner-journey", title: "学习者旅程与目标", purpose: "描述从设定目标到复盘结果的完整体验。", role: "requirements" },
    { id: "task-domain", title: "学习任务与领域模型", purpose: "定义计划、任务、标签、进度和完成规则。", role: "data" },
    { id: "timer-state", title: "计时与状态机设计", purpose: "明确开始、暂停、恢复、完成和异常恢复行为。", role: "architecture" },
    { id: "statistics-feedback", title: "统计指标与学习反馈", purpose: "说明统计口径、可视化和激励反馈。", role: "frontend" },
    { id: "sync-acceptance", title: "数据同步、测试与验收", purpose: "验证计时准确性、数据一致性和关键用户场景。", role: "testing" },
  ],
  ecommerce: [
    { id: "commerce-scope", title: "交易目标与用户场景", purpose: "定义消费者和运营人员的关键交易场景。", role: "requirements" },
    { id: "catalog", title: "商品、库存与检索模型", purpose: "规划商品数据、库存规则和发现路径。", role: "data" },
    { id: "checkout", title: "购物车、结算与支付状态", purpose: "明确交易链路、幂等和异常补偿。", role: "backend" },
    { id: "operations", title: "订单、履约与售后后台", purpose: "规划运营处理流程和权限边界。", role: "architecture" },
    { id: "commerce-quality", title: "安全、测试与上线", purpose: "验证支付、订单一致性、安全与可观测性。", role: "security" },
  ],
  dashboard: [
    { id: "metrics", title: "业务问题与指标口径", purpose: "确保每个图表回答明确问题且口径一致。", role: "requirements" },
    { id: "sources", title: "数据来源与更新链路", purpose: "描述采集、清洗、聚合和刷新策略。", role: "data" },
    { id: "visualization", title: "可视化与交互设计", purpose: "选择合适图表并规划筛选、钻取和联动。", role: "frontend" },
    { id: "query-security", title: "查询性能与数据权限", purpose: "平衡响应速度、缓存和行列级权限。", role: "backend" },
    { id: "dashboard-quality", title: "数据质量、测试与发布", purpose: "验证口径、性能、异常提示和监控。", role: "testing" },
  ],
  api: [
    { id: "api-goals", title: "调用场景与服务边界", purpose: "定义调用方、资源和不承担的职责。", role: "requirements" },
    { id: "api-contract", title: "接口、错误与版本契约", purpose: "规划资源、请求响应、错误码和兼容策略。", role: "backend" },
    { id: "api-security", title: "认证、授权与流量治理", purpose: "定义身份、权限、限流和滥用防护。", role: "security" },
    { id: "api-data", title: "数据一致性与异步流程", purpose: "说明事务、幂等、事件和补偿策略。", role: "data" },
    { id: "api-delivery", title: "测试、文档与可观测性", purpose: "覆盖契约测试、接入文档、监控和发布。", role: "testing" },
  ],
  other: [
    { id: "problem-scope", title: "问题、目标与范围", purpose: "澄清要解决的问题和可验收边界。", role: "requirements" },
    { id: "user-flow", title: "用户流程与功能设计", purpose: "描述核心任务、页面和异常路径。", role: "frontend" },
    { id: "system-design", title: "系统、数据与接口设计", purpose: "给出组件、数据和集成关系。", role: "architecture" },
    { id: "quality", title: "风险、测试与安全", purpose: "识别风险并规划验证与防护措施。", role: "testing" },
    { id: "delivery", title: "实施顺序与交付标准", purpose: "形成可执行的迭代、验收和报告结构。", role: "reporter" },
  ],
};

export function createBaselinePlan(analysis: RequirementAnalysis, budget: BudgetState): ExecutionPlan {
  const definitions = SECTION_DEFINITIONS[analysis.projectType];
  const selected = definitions.slice(0, Math.max(1, Math.min(definitions.length, budget.maxTasks)));
  const totalTokens = Math.min(budget.maxTokens, 6_000 * selected.length);
  const baseTokens = Math.floor(totalTokens / selected.length);
  const tasks = selected.map((section, index) => ({
    id: `task-${section.id}`,
    title: `研究并形成“${section.title}”`,
    description: `${section.purpose}输出应说明依据、方案、取舍、风险和验收方法。`,
    agentRole: section.role,
    dependsOn: index === 0 ? [] : [`task-${selected[index - 1].id}`],
    toolIds: ["knowledge-search"],
    estimatedTokens: baseTokens + (index < totalTokens % selected.length ? 1 : 0),
    reportSectionIds: [section.id],
  }));
  return {
    schemaVersion: 1,
    title: `${analysis.summary.slice(0, 80)}：产品/UI实施规划`,
    rationale: `根据 ${analysis.projectType} 项目的用户、范围和主要风险，按依赖顺序组织产品、UI 和工程分析，并让每项任务直接提供报告章节证据。`,
    tasks,
    reportSections: selected.map((section, index) => ({ id: section.id, title: section.title, purpose: section.purpose, order: index + 1, required: true, sourceTaskIds: [`task-${section.id}`] })),
    evaluationDimensions: ["需求覆盖与可追溯性", "技术可行性与取舍", "风险控制与可测试性", "报告清晰度与可执行性"],
    maxRounds: Math.min(2, budget.maxRounds),
    estimatedTotalTokens: totalTokens,
    estimatedCostUsd: Math.min(budget.maxCostUsd, Number(((totalTokens / 1_000_000) * 5).toFixed(4))),
  };
}
