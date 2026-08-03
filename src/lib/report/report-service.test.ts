import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { runReviewWorkflow } from "@/lib/review/review-service";
import { DEFAULT_GITHUB_UI_EVIDENCE, hasPinnedGitHubCommit } from "./github-ui-evidence";
import {
  buildDownstreamAgentPrompt,
  buildProductUIHandoffBundle,
  renderProductUIHandoffJson,
  renderProductUIReportGroupMarkdown,
  renderProductUISpecMarkdown,
} from "./product-ui-export";
import { createProductUIReportGroup } from "./product-ui-report";
import { deriveProductUIReportGroupStatus } from "./product-ui-group-service";
import { ProductUIReportGroupSchema } from "./contracts";
import { createBaselineDevelopmentReport, validateDevelopmentReport, type ReportGenerationInput } from "./report-service";

async function fixture(requirement: string): Promise<ReportGenerationInput> {
  const analysis = analyzeRequirementBaseline(requirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const result = await runReviewWorkflow({ analysis, plan, budget: ReviewBudgetSchema.parse({}) });
  return {
    planningArtifactId: `plan-${analysis.projectType}`,
    requirement,
    analysis,
    plan,
    reviewWorkflow: {
      id: `review-${analysis.projectType}`,
      status: "approved",
      candidates: result.candidates,
      review: result.review,
      evaluation: { ...result.evaluation, decision: "approved", unresolvedConflicts: [] },
      failures: [],
      approval: {
        status: "approved", decision: "hybrid", note: "Keep hard safety gates and stage the rest.", decidedAt: "2026-07-15T11:35:00.000Z",
        taskPatch: null, originalPlanSha256: null, amendedPlanSha256: null,
      },
    },
    knowledgeEvidence: [],
  };
}

test("website, admin and learning reports keep their Planner-defined dynamic chapters", async () => {
  const inputs = await Promise.all([
    fixture("Build a public company website for customers with product pages, case studies, contact forms, accessibility and staged delivery."),
    fixture("Build an operations admin portal for staff with role permissions, workflow, audit history, search and staged delivery."),
    fixture("Build a student learning planner with task breakdown, focus sessions, progress charts, weekly review and privacy."),
  ]);
  const reports = inputs.map(createBaselineDevelopmentReport);
  assert.equal(new Set(reports.map((report) => report.sections.map((section) => section.id).join("|"))).size, 3);
  for (let index = 0; index < reports.length; index += 1) {
    assert.deepEqual(reports[index].sections.map((section) => section.id), [...inputs[index].plan.reportSections].sort((a, b) => a.order - b.order).map((section) => section.id));
    assert.equal(validateDevelopmentReport(reports[index], inputs[index]).valid, true);
  }
});

test("every baseline claim resolves through the source manifest", async () => {
  const input = await fixture("Build an admin dashboard for operators with roles, approval workflow, audit history, tests and phased acceptance.");
  const report = createBaselineDevelopmentReport(input);
  const manifest = new Set(report.sourceManifest.map((source) => `${source.sourceType}:${source.refId}`));
  const claims = [...report.sections.flatMap((section) => section.claims), ...report.assumptions, ...report.risks, ...report.unresolvedItems];
  assert.ok(claims.length > 0);
  assert.ok(claims.every((claim) => claim.sourceRefs.every((source) => manifest.has(`${source.sourceType}:${source.refId}`))));
  assert.ok(report.sections.every((section) => section.bodyMarkdown.includes("[source:")));
});

test("partial review becomes an explicitly partial report with disclosed failures", async () => {
  const input = await fixture("Build a customer support admin portal with roles, ticket workflow, audit history and acceptance tests.");
  input.reviewWorkflow.status = "partial";
  input.reviewWorkflow.failures = [{ stage: "review", code: "REVIEW_FAILED" }];
  input.reviewWorkflow.approval = {
    status: "not_required", decision: null, note: null, decidedAt: null,
    taskPatch: null, originalPlanSha256: null, amendedPlanSha256: null,
  };
  const report = createBaselineDevelopmentReport(input);
  assert.equal(report.status, "partial");
  assert.ok(report.unresolvedItems.some((item) => item.statement.includes("REVIEW_FAILED")));
});

test("sensitive material is rejected before a report can be persisted or exported", async () => {
  const input = await fixture("Build a public website with products, case studies, contact form, accessibility and staged delivery.");
  const report = createBaselineDevelopmentReport(input);
  report.executiveSummary += " api_key: TEST_ONLY_PLACEHOLDER";
  assert.deepEqual(validateDevelopmentReport(report, input).issues, ["REPORT_SENSITIVE_CONTENT"]);
});

test("model output cannot invent a knowledge citation absent from the source chain", async () => {
  const input = await fixture("Build a public website with products, contact form, accessibility and staged delivery.");
  const report = createBaselineDevelopmentReport(input);
  report.sections[0].claims[0].sourceRefs.push({ sourceType: "knowledge", refId: "invented-document", label: "Invented source", locator: null });
  report.sourceManifest.push({ sourceType: "knowledge", refId: "invented-document", label: "Invented source", locator: null, usedByClaimIds: [report.sections[0].claims[0].id] });
  assert.ok(validateDevelopmentReport(report, input).issues.some((issue) => issue.startsWith("REPORT_SOURCE_INVALID")));
});

test("approved task edits remain explicit report provenance", async () => {
  const input = await fixture("Build an operations admin portal with role permissions, audit history, approval workflow and staged acceptance.");
  const editedTask = input.plan.tasks[0];
  input.plan = {
    ...input.plan,
    tasks: input.plan.tasks.map((task) => task.id === editedTask.id
      ? { ...task, title: "人工确认后的首项任务" }
      : task),
  };
  input.reviewWorkflow.approval.taskPatch = {
    schemaVersion: 1,
    taskEdits: [{ taskId: editedTask.id, title: "人工确认后的首项任务" }],
  };
  input.reviewWorkflow.approval.originalPlanSha256 = "original-fingerprint";
  input.reviewWorkflow.approval.amendedPlanSha256 = "amended-fingerprint";

  const report = createBaselineDevelopmentReport(input);
  const amendment = report.unresolvedItems.find((item) => item.id === "human-task-edits");
  assert.ok(amendment);
  assert.deepEqual(amendment.sourceRefs, [{
    sourceType: "human_task_edit",
    refId: editedTask.id,
    label: `人工修改任务：${editedTask.id}`,
    locator: "amended-fingerprint",
  }]);
  assert.equal(validateDevelopmentReport(report, input).valid, true);
});

test("product/UI report group generates three distinct downstream-ready target designs", async () => {
  const input = await fixture("Build a customer-facing product workspace with requirements intake, review workflow, report export and responsive UI acceptance.");
  const group = createProductUIReportGroup(input);

  assert.equal(group.reports.length, 3);
  assert.equal(new Set(group.reports.map((report) => report.productUISpec?.solutionId)).size, 3);
  assert.deepEqual(group.reports.map((report) => report.productUISpec?.solutionType), ["experience_first", "visual_first", "engineering_first"]);
  assert.ok(group.reports.every((report) => (report.productUISpec?.pages.length ?? 0) >= 3));
  assert.ok(group.reports.every((report) => report.productUISpec?.evidence.length === DEFAULT_GITHUB_UI_EVIDENCE.length));
  assert.ok(DEFAULT_GITHUB_UI_EVIDENCE.every(hasPinnedGitHubCommit));
  assert.ok(group.reports.every((report) => report.productUISpec?.evidenceStatus === "sha_pinned"));
  assert.deepEqual(DEFAULT_GITHUB_UI_EVIDENCE.map((item) => item.path), ["README.md / apps/v4/registry / apps/v4/content/docs/registry", "packages/react", "components / docs"]);
  assert.ok(group.reports.every((report) => report.productUISpec?.evidenceAuditStatus === "fully_verified"));
  assert.ok(new Set(group.reports.map((report) => report.productUISpec?.designDirection.name)).size === 3);
  assert.ok(group.reports.every((report) => (report.productUISpec?.deliveryBoundary.included.length ?? 0) > 0));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.some((item) => item.area === "requirement")));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.some((item) => item.status === "target_design")));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.filter((item) => item.area === "github").every((item) => item.status === "verified")));

  const report = group.reports[0];
  const markdown = renderProductUISpecMarkdown(report, { generatedAt: "2026-08-02T00:00:00.000Z" });
  const prompt = buildDownstreamAgentPrompt(report);
  const groupMarkdown = renderProductUIReportGroupMarkdown(group.reports);
  assert.match(markdown, /sha_pinned/);
  assert.match(markdown, /\/workspace/);
  assert.match(markdown, /GitHub/);
  assert.doesNotMatch(markdown, /main 分支版本尚未冻结 commit SHA/);
  assert.match(markdown, /证据审计状态：fully_verified/);
  assert.match(markdown, /固定 SHA 只保证引用快照可复现/);
  assert.match(markdown, /仓库核验：verified/);
  assert.match(markdown, /交付边界与来源映射/);
  assert.match(markdown, /需求目标：/);
  assert.match(prompt, /loading/);
  assert.match(prompt, /截图/);
  assert.equal(groupMarkdown.split("\n\n---\n\n").length, 3);

  const mixedEvidence = [
    ...DEFAULT_GITHUB_UI_EVIDENCE.slice(0, 2),
    { ...DEFAULT_GITHUB_UI_EVIDENCE[2], commitOrTag: "main (待冻结 SHA)" },
  ];
  const mixedEvidenceGroup = createProductUIReportGroup(input, { evidence: mixedEvidence });
  assert.ok(mixedEvidenceGroup.reports.every((item) => item.productUISpec?.evidenceStatus === "not_yet_verified"));
  assert.ok(mixedEvidenceGroup.reports.every((item) => item.productUISpec?.traceability.some((trace) => trace.area === "github" && trace.status === "verified")));

  const fullyVerifiedEvidence = DEFAULT_GITHUB_UI_EVIDENCE.map((item) => ({
    ...item,
    repositoryVerification: "verified" as const,
    pathVerification: "verified" as const,
    licenseVerification: "verified" as const,
  }));
  const fullyVerifiedGroup = createProductUIReportGroup(input, { evidence: fullyVerifiedEvidence, solutionTypes: ["experience_first", "visual_first"] });
  assert.ok(fullyVerifiedGroup.reports.every((item) => item.productUISpec?.evidenceAuditStatus === "fully_verified"));
  assert.ok(fullyVerifiedGroup.reports.every((item) => item.productUISpec?.traceability.some((trace) => trace.area === "github" && trace.status === "verified")));
});

test("product/UI feedback status requires runtime evidence before acceptance", async () => {
  const solutionIds = ["experience", "visual", "engineering"];
  const runtimeEvidence = {
    launchCommand: "npm run dev",
    previewUrl: "http://localhost:3000",
    screenshotPaths: ["artifacts/home-desktop.png"],
    verificationNotes: ["Chrome 桌面端：首页、表单和移动端检查通过。"],
    acceptanceResults: [],
  };
  const requiredAcceptanceIdsBySolution = Object.fromEntries(solutionIds.map((solutionId) => [solutionId, ["page-home-structure", "responsive-global-layout"]]));
  const completeAcceptanceResults = requiredAcceptanceIdsBySolution.experience.map((acceptanceId) => ({
    acceptanceId,
    status: "passed" as const,
    note: `已检查 ${acceptanceId}`,
    evidencePaths: [`artifacts/${acceptanceId}.png`],
  }));
  const completeRuntimeEvidence = { ...runtimeEvidence, acceptanceResults: completeAcceptanceResults };

  assert.equal(deriveProductUIReportGroupStatus([], solutionIds), "generated");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence: null, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds), "in_review");
  // 没有稳定验收矩阵的旧报告继续按运行证据兼容判断。
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", runtimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", runtimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds), "accepted");
  // 新报告只有每套方案所有稳定 ID 都有通过状态和证据时才能 accepted。
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds, requiredAcceptanceIdsBySolution), "accepted");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds, requiredAcceptanceIdsBySolution), "in_review");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence: { ...completeRuntimeEvidence, acceptanceResults: [{ ...completeAcceptanceResults[0], status: "failed" as const }] }, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds, requiredAcceptanceIdsBySolution), "needs_revision");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", runtimeEvidence: { ...completeRuntimeEvidence, acceptanceResults: [{ ...completeAcceptanceResults[0], status: "not_verified" as const }] }, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", runtimeEvidence: completeRuntimeEvidence, checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds, requiredAcceptanceIdsBySolution), "in_review");
  const generatedGroup = createProductUIReportGroup(await fixture("Build a legacy-compatible product UI report group."));
  const legacyGroup = ProductUIReportGroupSchema.parse({
    ...generatedGroup,
    feedback: [{ solutionId: "experience", outcome: "pass", note: "旧反馈", checkedAt: "2026-08-02T00:00:00.000Z" }],
  });
  assert.equal(legacyGroup.feedback[0]?.runtimeEvidence, null);
});
test("product/UI JSON handoff keeps complete specs, prompts and runtime acceptance state", async () => {
  const group = createProductUIReportGroup(await fixture("Build a product workspace with three UI directions and downstream implementation handoff."));
  const completeAcceptanceResults = (group.reports[0].productUISpec?.acceptanceMatrix ?? []).map((item) => ({
    acceptanceId: item.id,
    status: "passed" as const,
    note: `Unit fixture verified ${item.id}`,
    evidencePaths: [`artifacts/${item.id}.png`],
  }));
  const runtimeEvidence = {
    launchCommand: "npm run dev",
    previewUrl: "http://localhost:3000",
    screenshotPaths: ["artifacts/home-desktop.png"],
    verificationNotes: ["桌面端和移动端页面已运行检查。"],
    acceptanceResults: completeAcceptanceResults,
  };
  const withFeedback = ProductUIReportGroupSchema.parse({
    ...group,
    status: "in_review",
    feedback: [{
      solutionId: group.reports[0].productUISpec?.solutionId,
      outcome: "pass",
      note: "已完成一次运行验收。",
      runtimeEvidence,
      checkedAt: "2026-08-02T00:00:00.000Z",
    }],
  });

  const bundle = buildProductUIHandoffBundle(withFeedback, { generatedAt: "2026-08-02T00:00:00.000Z" });
  assert.equal(bundle.handoffType, "agentforge_product_ui");
  assert.equal(bundle.solutions.length, 3);
  assert.ok(bundle.solutions.every((solution) => solution.report.productUISpec));
  assert.ok(bundle.solutions.every((solution) => solution.aiExecutionReport.length > 0));
  assert.ok(bundle.solutions.every((solution) => solution.aiExecutionReport === solution.aiExecutionMarkdown));
  assert.ok(bundle.solutions.every((solution) => solution.aiExecutionReport === solution.markdown));
  assert.ok(bundle.solutions.every((solution) => solution.downstreamPrompt.includes("下游 AI 编程 Agent")));
  assert.equal(bundle.solutions[0].runtimeAcceptance.status, "pass");
  assert.equal(bundle.solutions[0].runtimeAcceptance.hasRuntimeEvidence, true);
  assert.equal(bundle.solutions[1].runtimeAcceptance.status, "pending");
  assert.ok(bundle.handoffContract.requiredArtifacts.some((item) => item.includes("启动命令")));
  assert.ok(bundle.solutions[0].downstreamPrompt.includes("只能填写真实值"));

  const json = JSON.parse(renderProductUIHandoffJson(withFeedback, { generatedAt: "2026-08-02T00:00:00.000Z" })) as typeof bundle;
  assert.equal(json.groupId, group.groupId);
  assert.equal(json.solutions.length, 3);
  const selected = buildProductUIHandoffBundle(withFeedback, {
    generatedAt: "2026-08-02T00:00:00.000Z",
    selectedSolutionId: group.reports[1].productUISpec?.solutionId,
  });
  assert.equal(selected.selectedSolutionId, group.reports[1].productUISpec?.solutionId);
  assert.equal(selected.solutions.length, 1);
  assert.equal(selected.comparison.length, 1);
});

test("product/UI report is the primary executable handoff and exposes evidence boundaries", async () => {
  const group = createProductUIReportGroup(await fixture("Build a product UI report that a downstream coding agent can implement and verify."));
  const report = group.reports[0];
  const spec = report.productUISpec;

  assert.ok(spec);

  const markdown = renderProductUISpecMarkdown(report, {
    generatedAt: "2026-08-03T00:00:00.000Z",
  });
  const prompt = buildDownstreamAgentPrompt(report);

  assert.ok(markdown.includes("## AI 执行契约"));
  assert.ok(markdown.includes("## 页面清单"));
  assert.ok(markdown.includes("实施要求："));
  assert.ok(markdown.includes("## 交付边界与来源映射"));
  assert.ok(markdown.includes("## 当前状态声明"));
  assert.ok(markdown.includes("implemented"));
  assert.ok(markdown.includes("page-home-structure"));
  assert.ok(markdown.includes("blueprint"));
  assert.ok(markdown.includes("target_design"));
  assert.ok(markdown.includes("verified"));
  assert.ok(markdown.includes("verified"));

  assert.ok(spec.pages.every((page) =>
    (page.implementationInstructions?.length ?? 0) > 0 ||
    page.acceptanceCriteria.length > 0
  ));
  assert.ok(spec.pages.every((page) => {
    const blueprint = page.blueprint;
    return Boolean(
      blueprint &&
      blueprint.layout.length > 0 &&
      blueprint.aboveFold.length > 0 &&
      blueprint.contentRules.length > 0 &&
      blueprint.interactionRules.length > 0
    );
  }));

  const acceptanceMatrix = spec.acceptanceMatrix ?? [];
  const acceptanceIds = new Set(acceptanceMatrix.map((item) => item.id));
  assert.ok(acceptanceMatrix.length > 0);
  assert.ok(spec.pages.every((page) => acceptanceIds.has(`page-${page.id}-structure`)));
  assert.ok(spec.pages.every((page) => acceptanceIds.has(`page-${page.id}-blueprint`)));
  for (const targetType of ["responsive", "accessibility", "evidence", "export", "runtime"] as const) {
    assert.ok(acceptanceMatrix.some((item) => item.targetType === targetType));
  }

  assert.ok(prompt.includes("AI 执行契约"));
  assert.ok(prompt.includes("只能填写真实值"));
  assert.ok(prompt.includes("launchCommand"));
  assert.ok(prompt.includes("verificationNotes"));
  assert.ok(prompt.includes("page-home-structure"));
  assert.ok(prompt.includes("\u771f\u5b9e\u8bc1\u636e"));
  assert.ok(prompt.includes("## 产品定位"));
  assert.ok(prompt.includes("## 页面清单"));
  assert.ok(prompt.includes("## 交付边界与来源映射"));
  assert.ok(prompt.includes(markdown.slice(markdown.indexOf("## 产品定位"))));
});
test("text-only pass feedback cannot be exported as runtime acceptance", async () => {
  const group = createProductUIReportGroup(await fixture("Build a report that must distinguish design intent from verified website output."));
  const legacyFeedbackGroup = ProductUIReportGroupSchema.parse({
    ...group,
    feedback: [{
      solutionId: group.reports[0].productUISpec?.solutionId,
      outcome: "pass",
      note: "只有文字反馈，没有运行证据。",
      runtimeEvidence: null,
      checkedAt: "2026-08-02T00:00:00.000Z",
    }],
  });

  const bundle = buildProductUIHandoffBundle(legacyFeedbackGroup);
  assert.equal(bundle.solutions[0].runtimeAcceptance.status, "pending");
  assert.equal(bundle.solutions[0].runtimeAcceptance.hasRuntimeEvidence, false);
});

test("GitHub evidence provenance is required for product/UI references", async () => {
  const input = await fixture("Build a product workspace with accessible navigation, report pages and responsive delivery.");
  const report = createBaselineDevelopmentReport(input);
  report.sections[0].claims[0].sourceRefs.push({
    sourceType: "github_evidence",
    refId: "missing-github-evidence",
    label: "Missing GitHub evidence",
    locator: null,
  });
  report.sourceManifest.push({
    sourceType: "github_evidence",
    refId: "missing-github-evidence",
    label: "Missing GitHub evidence",
    locator: null,
    usedByClaimIds: [report.sections[0].claims[0].id],
  });
  assert.ok(validateDevelopmentReport(report, input).issues.includes("REPORT_SOURCE_INVALID:" + report.sections[0].claims[0].id));
});
