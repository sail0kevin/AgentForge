import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductUIBlindReviewSubmissionSchema,
  ProductUIImplementationEvaluationCaseSchema,
  ProductUIHumanReviewDimensionSchema,
  analyzeProductUIImplementationComparison,
  createProductUIImplementationEvaluationCase,
  createProductUIImplementationRunMetadata,
  stableJsonSha256,
  validateProductUIImplementationRun,
} from "./product-ui-implementation-evaluation";

function evaluationCase(caseId = "case-attendance") {
  return createProductUIImplementationEvaluationCase({
    studyId: "product-ui-comparison-v1",
    caseId,
    requirement: "Create an attendance workspace with a clear hierarchy, accessible filtering, responsive tables and an export action.",
    reportGroupId: "group-attendance",
    solutionId: "solution-attendance",
    routes: ["/attendance"],
    expectedAcceptanceIds: ["route-renders", "table-visible", "responsive-layout"],
    acceptanceProbes: [
      { acceptanceId: "route-renders", kind: "route", route: "/attendance" },
      { acceptanceId: "table-visible", kind: "selector_visible", route: "/attendance", selector: "[data-testid='attendance-table']" },
    ],
    downstreamModel: {
      provider: "test",
      model: "test-model",
      promptVersion: "prompt-v1",
      parameters: { temperature: 0 },
      adapterVersion: "test-adapter-v1",
    },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "product-ui-rubric-v1",
    baselinePrompt: "Implement the attendance website directly from this requirement.",
    agentforgePrompt: "Implement the attendance website from this frozen AgentForge manifest.",
    report: { title: "Attendance report", findings: ["traceable"] },
    manifest: { manifestType: "agentforge_product_ui_implementation", routes: ["/attendance"] },
  });
}

function runtimeEvidence(
  evaluation: ReturnType<typeof evaluationCase>,
  variant: "baseline_direct_prompt" | "agentforge_manifest",
  statuses: Array<"passed" | "failed" | "not_verified"> = ["passed", "passed", "not_verified"],
) {
  const implementationRun = createProductUIImplementationRunMetadata(evaluation, {
    runId: `${evaluation.caseId}-${variant}`,
    caseId: evaluation.caseId,
    variant,
    sourceRevision: "abc123",
    startedAt: "2026-08-04T00:00:00.000Z",
    completedAt: "2026-08-04T00:00:02.000Z",
    exitStatus: "completed",
    playwrightOutputPaths: ["artifacts/playwright.json"],
    executionEvidence: {
      provider: evaluation.downstreamModel.provider,
      model: evaluation.downstreamModel.model,
      promptVersion: evaluation.downstreamModel.promptVersion,
      parametersSha256: stableJsonSha256(evaluation.downstreamModel.parameters),
      adapterVersion: evaluation.downstreamModel.adapterVersion,
      seedSha256: "e".repeat(64),
      generatorSummaryPath: "artifacts/claude-generator-summary.json",
    },
  });
  return {
    launchCommand: "npm run dev",
    previewUrl: "http://127.0.0.1:3000",
    screenshotPaths: ["artifacts/attendance.png"],
    verificationNotes: ["Browser probe completed against the local preview."],
    acceptanceResults: evaluation.expectedAcceptanceIds.map((acceptanceId, index) => ({
      acceptanceId,
      status: statuses[index] ?? "not_verified",
      note: `Probe result for ${acceptanceId}.`,
      evidencePaths: statuses[index] === "passed" ? [`artifacts/${acceptanceId}.png`] : [],
    })),
    implementationRun,
  };
}

test("Product/UI evaluation hashes structured data independently of object key order", () => {
  assert.equal(stableJsonSha256({ b: [2, 3], a: { y: true, x: "value" } }), stableJsonSha256({ a: { x: "value", y: true }, b: [2, 3] }));
  assert.notEqual(stableJsonSha256({ a: 1 }), stableJsonSha256({ a: 2 }));
});

test("Product/UI evaluation case fixes both branches, input hashes and probe targets", () => {
  const evaluation = evaluationCase();
  assert.deepEqual(evaluation.variants.map((item) => item.variant), ["baseline_direct_prompt", "agentforge_manifest"]);
  assert.equal(evaluation.variants[0]?.reportSha256, null);
  assert.match(evaluation.variants[1]?.manifestSha256 ?? "", /^[a-f0-9]{64}$/);

  const invalid = ProductUIImplementationEvaluationCaseSchema.safeParse({
    ...evaluation,
    variants: evaluation.variants.map((item) => item.variant === "baseline_direct_prompt"
      ? { ...item, reportSha256: "a".repeat(64) }
      : item),
  });
  assert.equal(invalid.success, false);
});

test("Product/UI implementation run rejects another input snapshot or model", () => {
  const evaluation = evaluationCase();
  const evidence = runtimeEvidence(evaluation, "agentforge_manifest");
  assert.equal(validateProductUIImplementationRun(evaluation, evidence).implementationRun?.runId, "case-attendance-agentforge_manifest");

  const changedPrompt = {
    ...evidence,
    implementationRun: { ...evidence.implementationRun!, promptSha256: "b".repeat(64) },
  };
  assert.throws(() => validateProductUIImplementationRun(evaluation, changedPrompt), /IMPLEMENTATION_RUN_INPUT_HASH_MISMATCH/);

  const changedModel = {
    ...evidence,
    implementationRun: { ...evidence.implementationRun!, downstreamModel: { ...evidence.implementationRun!.downstreamModel, model: "other-model" } },
  };
  assert.throws(() => validateProductUIImplementationRun(evaluation, changedModel), /IMPLEMENTATION_RUN_MODEL_MISMATCH/);
});

test("Product/UI comparison reports missing probes as unverified and blocks claims without paired evidence", () => {
  const evaluation = evaluationCase();
  const analysis = analyzeProductUIImplementationComparison({
    studyId: evaluation.studyId,
    cases: [evaluation],
    runs: [runtimeEvidence(evaluation, "agentforge_manifest")],
  });
  const agentforge = analysis.variants.find((item) => item.variant === "agentforge_manifest");
  assert.equal(agentforge?.acceptance.notVerified, 1);
  assert.equal(agentforge?.acceptance.passed, 2);
  assert.equal(analysis.runtimeComparisonEligible, false);
  assert.equal(analysis.qualityClaimEligible, false);
  assert.match(analysis.claimBoundary, /Toolchain output only/);
  assert.ok(analysis.protocolDeviations.includes("RUN_MISSING:case-attendance:baseline_direct_prompt"));
});

test("Product/UI comparison permits only descriptive runtime comparison after registered paired runs", () => {
  const evaluation = evaluationCase();
  const analysis = analyzeProductUIImplementationComparison({
    studyId: evaluation.studyId,
    cases: [evaluation],
    runs: [
      runtimeEvidence(evaluation, "baseline_direct_prompt"),
      runtimeEvidence(evaluation, "agentforge_manifest"),
    ],
    humanReviewCount: 1,
  });
  assert.equal(analysis.runtimeComparisonEligible, true);
  assert.equal(analysis.qualityClaimEligible, false);
  assert.equal(analysis.comparison.agentforgeAcceptancePassRateDelta, 0);
  assert.match(analysis.claimBoundary, /does not prove visual quality/);
});

function blindReviewData(evaluation: ReturnType<typeof evaluationCase>) {
  const candidates = [
    { candidateId: "blind-attendance-a", variant: "baseline_direct_prompt" },
    { candidateId: "blind-attendance-b", variant: "agentforge_manifest" },
  ] as const;
  const assignments = candidates.map((candidate) => ({
    schemaVersion: 1,
    studyId: evaluation.studyId,
    caseId: evaluation.caseId,
    candidateId: candidate.candidateId,
    variant: candidate.variant,
    reviewArtifactPaths: [`artifacts/blind/${candidate.candidateId}.png`],
  }));
  const submissions = candidates.map((candidate) => ({
    schemaVersion: 1,
    studyId: evaluation.studyId,
    caseId: evaluation.caseId,
    candidateId: candidate.candidateId,
    raterId: "rater-one",
    rubricVersion: evaluation.humanReviewRubricVersion,
    submittedAt: "2026-08-04T00:00:00.000Z",
    scores: ProductUIHumanReviewDimensionSchema.options.map((dimension) => ({
      dimension,
      score: candidate.variant === "agentforge_manifest" ? 4 : 3,
      reason: `The ${dimension} evidence is sufficient for this controlled review.`,
    })),
  }));
  return { assignments, submissions };
}

test("Product/UI blind review requires an anonymous paired dataset before quality comparison is eligible", () => {
  const evaluation = evaluationCase();
  const blind = blindReviewData(evaluation);
  const analysis = analyzeProductUIImplementationComparison({
    studyId: evaluation.studyId,
    cases: [evaluation],
    runs: [
      runtimeEvidence(evaluation, "baseline_direct_prompt"),
      runtimeEvidence(evaluation, "agentforge_manifest"),
    ],
    blindReviewAssignments: blind.assignments,
    blindReviewSubmissions: blind.submissions,
  });

  assert.equal(analysis.runtimeComparisonEligible, true);
  assert.equal(analysis.qualityComparisonEligible, true);
  assert.equal(analysis.qualityClaimEligible, false);
  assert.equal(analysis.humanReview.assignmentCount, 2);
  assert.equal(analysis.humanReview.submissionCount, 2);
  assert.equal(analysis.humanReview.pairedReviewCount, 1);
  assert.equal(analysis.humanReview.qualifiedCaseCount, 1);
  assert.equal(analysis.humanReview.dimensions.visual_completion.baselineMean, 3);
  assert.equal(analysis.humanReview.dimensions.visual_completion.agentforgeMean, 4);
  assert.equal(analysis.humanReview.dimensions.visual_completion.agentforgeMinusBaseline, 1);
  assert.deepEqual(analysis.protocolDeviations, []);
});

test("Product/UI blind-review submissions cannot carry branch identity", () => {
  const evaluation = evaluationCase();
  const blind = blindReviewData(evaluation);
  const invalid = ProductUIBlindReviewSubmissionSchema.safeParse({
    ...blind.submissions[0],
    variant: "agentforge_manifest",
  });
  assert.equal(invalid.success, false);
});

test("Product/UI comparison rejects incomplete paired reviews instead of counting one-sided ratings", () => {
  const evaluation = evaluationCase();
  const blind = blindReviewData(evaluation);
  const analysis = analyzeProductUIImplementationComparison({
    studyId: evaluation.studyId,
    cases: [evaluation],
    runs: [
      runtimeEvidence(evaluation, "baseline_direct_prompt"),
      runtimeEvidence(evaluation, "agentforge_manifest"),
    ],
    blindReviewAssignments: blind.assignments,
    blindReviewSubmissions: [blind.submissions[0]],
  });

  assert.equal(analysis.runtimeComparisonEligible, true);
  assert.equal(analysis.qualityComparisonEligible, false);
  assert.ok(analysis.protocolDeviations.includes("BLIND_REVIEW_PAIR_MISSING:case-attendance:rater-one"));
  assert.ok(analysis.protocolDeviations.includes("BLIND_REVIEW_RATER_COUNT_INSUFFICIENT:case-attendance"));
});

test("Product/UI comparison does not treat a legacy humanReviewCount as a real review dataset", () => {
  const evaluation = evaluationCase();
  const analysis = analyzeProductUIImplementationComparison({
    studyId: evaluation.studyId,
    cases: [evaluation],
    runs: [
      runtimeEvidence(evaluation, "baseline_direct_prompt"),
      runtimeEvidence(evaluation, "agentforge_manifest"),
    ],
    humanReviewCount: 2,
  });

  assert.equal(analysis.runtimeComparisonEligible, true);
  assert.equal(analysis.qualityComparisonEligible, false);
  assert.equal(analysis.humanReviewCount, 0);
  assert.ok(analysis.protocolDeviations.includes("HUMAN_REVIEW_DATASET_MISSING"));
});