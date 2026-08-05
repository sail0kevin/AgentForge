import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { runReviewWorkflow } from "@/lib/review/review-service";
import { ProductUIBlindReviewSubmissionSchema } from "./product-ui-implementation-evaluation";
import { buildProductUIImplementationExperimentPackage } from "./product-ui-implementation-experiment-package";
import { createProductUIReportGroup } from "./product-ui-report";
import type { ReportGenerationInput } from "./report-service";
import { exportProductUIImplementationExperimentPackage } from "../../../scripts/product-ui-implementation-experiment-package";

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
        status: "approved", decision: "hybrid", note: "Keep hard safety gates and stage the rest.", decidedAt: "2026-08-04T00:00:00.000Z",
        taskPatch: null, originalPlanSha256: null, amendedPlanSha256: null,
      },
    },
    knowledgeEvidence: [],
  };
}

test("Product/UI experiment package locks two implementation inputs and isolates blind-review material", async () => {
  const group = createProductUIReportGroup(await fixture("Build a cultural exhibition website with a responsive gallery, accessible navigation, artist stories and a clear visit-planning flow."), {
    groupId: "group-experiment-package",
  });
  const report = group.reports[0]!;
  const experimentPackage = buildProductUIImplementationExperimentPackage({
    studyId: "product-ui-comparison-v1",
    caseId: "case-cultural-exhibition",
    group,
    report,
    downstreamModel: { provider: "test", adapterVersion: "test-adapter-v1", model: "test-model", promptVersion: "prompt-v1", parameters: { temperature: 0 } },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "product-ui-rubric-v1",
    generatedAt: "2026-08-04T00:00:00.000Z",
  });

  assert.equal(experimentPackage.evaluationCase.variants.length, 2);
  assert.equal(experimentPackage.operatorHandoff.baseline.promptSha256, experimentPackage.evaluationCase.variants.find((item) => item.variant === "baseline_direct_prompt")?.promptSha256);
  assert.equal(experimentPackage.operatorHandoff.agentforge.manifestSha256, experimentPackage.evaluationCase.variants.find((item) => item.variant === "agentforge_manifest")?.manifestSha256);
  assert.ok(experimentPackage.operatorHandoff.agentforge.prompt.includes("Frozen AgentForge implementation manifest"));
  assert.ok(!experimentPackage.operatorHandoff.baseline.prompt.includes(report.title));

  assert.equal(experimentPackage.admin.blindReviewAssignments.length, 2);
  assert.deepEqual(experimentPackage.admin.blindReviewAssignments.map((item) => item.variant).sort(), ["agentforge_manifest", "baseline_direct_prompt"]);
  assert.equal(experimentPackage.reviewer.candidates.length, 2);
  const reviewerJson = JSON.stringify(experimentPackage.reviewer);
  assert.ok(!reviewerJson.includes("agentforge_manifest"));
  assert.ok(!reviewerJson.includes("baseline_direct_prompt"));
  assert.equal(ProductUIBlindReviewSubmissionSchema.safeParse(experimentPackage.reviewer.submissionTemplates[0]).success, false);
  assert.ok(experimentPackage.reviewer.submissionTemplates.every((template) => template.scores.every((score) => score.score === null && score.reason === "")));
});
test("Experiment-package exporter writes separated operator, admin and reviewer artifacts", async (t) => {
  const group = createProductUIReportGroup(await fixture("Build a responsive public-library website with book discovery, event reservations and an accessible membership journey."), {
    groupId: "group-experiment-export",
  });
  const outputDir = await mkdtemp(join(tmpdir(), "agentforge-product-ui-experiment-"));
  t.after(async () => rm(outputDir, { recursive: true, force: true }));

  const result = await exportProductUIImplementationExperimentPackage({
    studyId: "product-ui-export-v1",
    caseId: "case-public-library",
    reportGroup: group,
    solutionId: group.reports[0]!.productUISpec!.solutionId,
    downstreamModel: { provider: "test", adapterVersion: "test-adapter-v1", model: "test-model", promptVersion: "prompt-v1", parameters: { temperature: 0 } },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "product-ui-rubric-v1",
    generatedAt: "2026-08-04T00:00:00.000Z",
  }, outputDir);

  assert.equal(result.outputDir, outputDir);
  assert.equal(result.studyId, "product-ui-export-v1");
  const [evaluationCaseJson, baselinePrompt, agentforgePrompt, assignmentsJson, reviewerJson] = await Promise.all([
    readFile(join(outputDir, "case.json"), "utf8"),
    readFile(join(outputDir, "operator", "baseline-direct-prompt.md"), "utf8"),
    readFile(join(outputDir, "operator", "agentforge-manifest-prompt.md"), "utf8"),
    readFile(join(outputDir, "admin", "blind-review-assignments.json"), "utf8"),
    readFile(join(outputDir, "reviewer", "review-package.json"), "utf8"),
  ]);

  assert.equal(JSON.parse(evaluationCaseJson).caseId, "case-public-library");
  assert.ok(baselinePrompt.includes("User requirement:"));
  assert.ok(!baselinePrompt.includes("Frozen AgentForge implementation manifest"));
  assert.ok(agentforgePrompt.includes("Frozen AgentForge implementation manifest"));
  assert.deepEqual(JSON.parse(assignmentsJson).map((item: { variant: string }) => item.variant).sort(), ["agentforge_manifest", "baseline_direct_prompt"]);
  assert.ok(!reviewerJson.includes("agentforge_manifest"));
  assert.ok(!reviewerJson.includes("baseline_direct_prompt"));
});