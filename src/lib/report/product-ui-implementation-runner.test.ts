import assert from "node:assert/strict";
import test from "node:test";
import {
  ProductUIImplementationEvaluationRunnerConfigSchema,
  buildNotVerifiedAcceptanceResults,
} from "../../../scripts/product-ui-implementation-evaluate";

function evaluationCase() {
  return {
    schemaVersion: 1 as const,
    studyId: "runner-smoke-study",
    caseId: "attendance-smoke",
    requirement: "Create an attendance workbench that can be checked in a browser.",
    reportGroupId: "attendance-reports",
    solutionId: "attendance-ui",
    routes: ["/generated/attendance"],
    expectedAcceptanceIds: ["route.attendance", "language.attendance"],
    acceptanceProbes: [
      {
        acceptanceId: "route.attendance",
        kind: "route" as const,
        route: "/generated/attendance",
      },
    ],
    downstreamModel: {
      provider: "test",
      adapterVersion: "test-adapter-v1",
      model: "fixed-model",
      promptVersion: "smoke-v1",
      parameters: { temperature: 0 },
    },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "smoke-rubric-v1",
    claimBoundary: "This case only checks registered browser behavior and cannot prove visual quality.",
    variants: [
      {
        variant: "baseline_direct_prompt" as const,
        promptSha256: "a".repeat(64),
        reportSha256: null,
        manifestSha256: null,
      },
      {
        variant: "agentforge_manifest" as const,
        promptSha256: "b".repeat(64),
        reportSha256: "c".repeat(64),
        manifestSha256: "d".repeat(64),
      },
    ],
  };
}

test("runner config applies safe defaults while preserving the frozen case", () => {
  const config = ProductUIImplementationEvaluationRunnerConfigSchema.parse({
    evaluationCase: evaluationCase(),
    run: {
      runId: "attendance-smoke-agentforge",
      caseId: "attendance-smoke",
      variant: "agentforge_manifest",
    },
    previewUrl: "http://127.0.0.1:3100",
    launchCommand: "npm run dev -- --port 3100",
    generatorSummaryPath: "artifacts/claude-generator-summary.json",
  });
  assert.equal(config.headless, true);
  assert.equal(config.mobileViewport.width, 390);
  assert.equal(config.evaluationCase.caseId, "attendance-smoke");
});

test("runner leaves expected acceptance items without probes as not_verified", () => {
  const results = buildNotVerifiedAcceptanceResults(["route.attendance", "language.attendance"]);
  assert.deepEqual(results.map((item) => item.status), ["not_verified", "not_verified"]);
  assert.deepEqual(results[0]?.evidencePaths, []);
});