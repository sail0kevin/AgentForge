import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { runReviewWorkflow } from "@/lib/review/review-service";
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
      approval: { status: "approved", decision: "hybrid", note: "Keep hard safety gates and stage the rest.", decidedAt: "2026-07-15T11:35:00.000Z" },
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
  input.reviewWorkflow.approval = { status: "not_required", decision: null, note: null, decidedAt: null };
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
