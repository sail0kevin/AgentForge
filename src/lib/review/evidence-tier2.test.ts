import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema, type Finding } from "./contracts";
import { assessTieredEvidence } from "./evidence-tier2";
import { runReviewWorkflow } from "./review-service";

const analysis = analyzeRequirementBaseline("Create an operations portal with permissions, audit history, search, and staged acceptance.");
const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
const budget = ReviewBudgetSchema.parse({});

async function supportedFinding() {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const candidate = baseline.candidates[0]!;
  const finding: Finding = {
    id: "tier2-fixture",
    candidateId: candidate.id,
    severity: "high",
    category: "fixture",
    failureScenario: "A supported fixture must be checked by the optional semantic verifier.",
    evidenceRefs: [candidate.decisions[0]!.evidenceRefs[0]!],
    suggestion: "Retain only evidence that passes the configured verifier.",
    relatedCandidateIds: [],
  };
  return { finding, candidate };
}

test("Tier 2 is explicitly not configured and preserves only a Tier 1 structural label", async () => {
  const { finding, candidate } = await supportedFinding();
  const result = await assessTieredEvidence({ findings: [finding], candidates: [candidate] });
  assert.equal(result.status, "not_configured");
  assert.deepEqual(result.effectiveSupportedFindingIds, [finding.id]);
  assert.equal(result.effectiveSupportKind, "tier1_structural");
  assert.match(result.limitations[0], /does not establish semantic entailment/);
});

test("Tier 2 promotes only explicit entailment and keeps unknown results out of support", async () => {
  const { finding, candidate } = await supportedFinding();
  const result = await assessTieredEvidence({
    findings: [finding, { ...finding, id: "unknown-finding" }],
    candidates: [candidate],
    verifier: async ({ finding: current }) => current.id === finding.id
      ? { label: "entailed", reason: "The evidence directly supports the stated failure scenario." }
      : { label: "unknown", reason: "The verifier cannot decide from the available context." },
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.tier2EntailedFindingIds, [finding.id]);
  assert.deepEqual(result.tier2UnknownFindingIds, ["unknown-finding"]);
  assert.deepEqual(result.effectiveSupportedFindingIds, [finding.id]);
  assert.equal(result.effectiveSupportKind, "tier2_semantic");
});

test("Tier 2 verifier and result failures are disclosed and never promoted", async () => {
  const { finding, candidate } = await supportedFinding();
  const result = await assessTieredEvidence({
    findings: [finding],
    candidates: [candidate],
    verifier: async () => ({ label: "bad-label" as "unknown", reason: "bad" }),
  });
  assert.equal(result.status, "error");
  assert.deepEqual(result.effectiveSupportedFindingIds, []);
  assert.deepEqual(result.failures, [{ findingId: finding.id, code: "TIER2_RESULT_INVALID" }]);
});
