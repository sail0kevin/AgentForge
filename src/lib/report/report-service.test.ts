import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { runReviewWorkflow } from "@/lib/review/review-service";
import { DEFAULT_GITHUB_UI_EVIDENCE } from "./github-ui-evidence";
import { buildDownstreamAgentPrompt, renderProductUIReportGroupMarkdown, renderProductUISpecMarkdown } from "./product-ui-export";
import { createProductUIReportGroup } from "./product-ui-report";
import { deriveProductUIReportGroupStatus } from "./product-ui-group-service";
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
  assert.ok(group.reports.every((report) => report.productUISpec?.evidenceStatus === "not_yet_verified"));
  assert.ok(new Set(group.reports.map((report) => report.productUISpec?.designDirection.name)).size === 3);
  assert.ok(group.reports.every((report) => (report.productUISpec?.deliveryBoundary.included.length ?? 0) > 0));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.some((item) => item.area === "requirement")));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.some((item) => item.status === "target_design")));
  assert.ok(group.reports.every((report) => report.productUISpec?.traceability.some((item) => item.status === "unverified")));

  const report = group.reports[0];
  const markdown = renderProductUISpecMarkdown(report, { generatedAt: "2026-08-02T00:00:00.000Z" });
  const prompt = buildDownstreamAgentPrompt(report);
  const groupMarkdown = renderProductUIReportGroupMarkdown(group.reports);
  assert.match(markdown, /not_yet_verified/);
  assert.match(markdown, /\/workspace/);
  assert.match(markdown, /GitHub/);
  assert.match(markdown, /交付边界与来源映射/);
  assert.match(markdown, /需求目标：/);
  assert.match(prompt, /loading/);
  assert.match(prompt, /截图/);
  assert.equal(groupMarkdown.split("\n\n---\n\n").length, 3);
});

test("product/UI feedback status only accepts known solutions and closes after all pass", () => {
  const solutionIds = ["experience", "visual", "engineering"];
  assert.equal(deriveProductUIReportGroupStatus([], solutionIds), "generated");
  assert.equal(deriveProductUIReportGroupStatus([{ solutionId: "experience", outcome: "pass", note: "页面已运行", checkedAt: "2026-08-02T00:00:00.000Z" }], solutionIds), "in_review");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "pass", note: "页面已运行", checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds), "accepted");
  assert.equal(deriveProductUIReportGroupStatus([
    { solutionId: "experience", outcome: "needs_revision", note: "移动端需要调整", checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "visual", outcome: "pass", note: "视觉已验收", checkedAt: "2026-08-02T00:00:00.000Z" },
    { solutionId: "engineering", outcome: "pass", note: "交互已验收", checkedAt: "2026-08-02T00:00:00.000Z" },
  ], solutionIds), "needs_revision");
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
