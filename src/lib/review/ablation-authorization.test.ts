import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { validateAblationExecutionAuthorization } from "./ablation-authorization";
import { createAblationRunPlan } from "./ablation-protocol";
import { hashAblationJson } from "./ablation-results";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";
import { ABLATION_LONGCAT_PRICING_SNAPSHOT } from "./ablation-budget";

const workspaceRoot = path.resolve("workspace-for-test");
const plan = createAblationRunPlan(validateLightweightCaseManifest({
  schemaVersion: 1,
  protocolVersion: "fixture-v1",
  frozenAt: "2026-08-01T00:00:00+08:00",
  cases: Array.from({ length: 20 }, (_, index) => ({
    caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
    category: "website",
    complexity: "medium",
    requirement: "Create a representative requirement-planning case with user roles, scope, acceptance criteria, data constraints, access control, audit records, error handling, performance goals, and post-release operations.",
    checklist: Array.from({ length: 5 }, (_, point) => ({ id: `point-${point + 1}`, description: `Checklist point ${point + 1}`, keywords: [`keyword-${point + 1}`], isConstraint: false })),
  })),
}), 1, 1);

function configuration() {
  return {
    provider: "longcat-openai-compatible" as const,
    model: "longcat-test",
    temperature: 0,
    plannerPromptVersion: "planner-v1",
    reviewPromptVersion: "review-v1",
    ragSnapshot: "rag-v1",
    maxEstimatedInputTokensPerCall: 16_000,
    maxOutputTokensPerCall: 12_000,
    pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
    maxCostUsdPerRun: 2,
    maxTotalCostUsd: 200,
    rawOutputRoot: path.join(workspaceRoot, "local-only", "ablation", "raw"),
    ledgerPath: path.join(workspaceRoot, "local-only", "ablation", "ledger.json"),
  };
}

function authorization() {
  return {
    schemaVersion: 2 as const,
    status: "approved" as const,
    approvedBy: "test-owner",
    approvedAt: "2026-08-01T00:00:00+08:00",
    ...configuration(),
    caseManifestSha256: plan.caseManifestSha256,
    runPlanSha256: hashAblationJson(plan),
  };
}

test("ablation execution authorization binds the frozen plan and all cost-bearing settings", () => {
  assert.equal(validateAblationExecutionAuthorization({ rawAuthorization: authorization(), configuration: configuration(), plan, workspaceRoot }).approvedBy, "test-owner");

  assert.throws(
    () => validateAblationExecutionAuthorization({ rawAuthorization: { ...authorization(), temperature: 0.2 }, configuration: configuration(), plan, workspaceRoot }),
    /ABLATION_AUTHORIZATION_CONFIGURATION_MISMATCH/,
  );
  assert.throws(
    () => validateAblationExecutionAuthorization({ rawAuthorization: { ...authorization(), runPlanSha256: "0".repeat(64) }, configuration: configuration(), plan, workspaceRoot }),
    /ABLATION_AUTHORIZATION_PLAN_MISMATCH/,
  );
  assert.throws(
    () => validateAblationExecutionAuthorization({ rawAuthorization: { ...authorization(), pricingSnapshot: { ...configuration().pricingSnapshot, outputUsdPerMillion: 1 } }, configuration: configuration(), plan, workspaceRoot }),
    /ABLATION_AUTHORIZATION_CONFIGURATION_MISMATCH/,
  );
});

test("ablation execution authorization rejects outputs outside local-only", () => {
  const config = { ...configuration(), rawOutputRoot: path.join(workspaceRoot, "public-output") };
  const rawAuthorization = { ...authorization(), rawOutputRoot: config.rawOutputRoot };
  assert.throws(
    () => validateAblationExecutionAuthorization({ rawAuthorization, configuration: config, plan, workspaceRoot }),
    /ABLATION_AUTHORIZATION_PRIVATE_PATH_REQUIRED/,
  );
});
