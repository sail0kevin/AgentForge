import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema, type Finding } from "./contracts";
import { validateTier1EvidenceBinding } from "./evidence-tier1";
import { summarizeTier1EvidenceCorpus, TIER1_EVIDENCE_FIXTURES } from "./evidence-tier1-fixtures";
import { runReviewWorkflow } from "./review-service";

const analysis = analyzeRequirementBaseline("Create an operations portal with permissions, audit history, search, and staged acceptance.");
const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
const budget = ReviewBudgetSchema.parse({});

test("Tier 1 frozen corpus validates evidence-to-candidate binding without model calls", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const delivery = baseline.candidates.find((candidate) => candidate.orientation === "delivery")!;
  const quality = baseline.candidates.find((candidate) => candidate.orientation === "quality")!;
  const candidates = [
    { ...delivery, id: "candidate-delivery", decisions: delivery.decisions.map((decision, index) => ({ ...decision, evidenceRefs: index === 0 ? ["deliveryRef", "deliverySecondaryRef", "sharedSourceRef"] : [] })) },
    { ...quality, id: "candidate-quality", decisions: quality.decisions.map((decision, index) => ({ ...decision, evidenceRefs: index === 0 ? ["qualityRef", "sharedSourceRef"] : [] })) },
  ];

  for (const fixture of TIER1_EVIDENCE_FIXTURES) {
    const finding: Finding = {
      id: fixture.id,
      candidateId: fixture.candidateId ?? "candidate-delivery",
      severity: fixture.severity,
      category: "evidence",
      failureScenario: "The finding must be structurally bound to a candidate-owned evidence reference.",
      evidenceRefs: [...fixture.evidenceRefs],
      suggestion: "Use a reference that belongs to the evaluated candidate.",
      relatedCandidateIds: [...fixture.relatedCandidateIds],
    };
    const validation = validateTier1EvidenceBinding(finding, candidates);
    assert.equal(validation.supported, fixture.expected === "supported", fixture.id);
    assert.equal(validation.failure, fixture.expectedFailure, fixture.id);
  }
});

test("Tier 1 corpus exposes structural coverage without a semantic-quality claim", () => {
  assert.deepEqual(summarizeTier1EvidenceCorpus(), {
    totalCases: 12,
    supportedCases: 4,
    ignoredCases: 8,
    coveredFailures: [
      "DUPLICATE_EVIDENCE_REFERENCE",
      "EMPTY_EVIDENCE",
      "UNKNOWN_CANDIDATE",
      "UNKNOWN_EVIDENCE_REFERENCE",
      "WRONG_CANDIDATE_EVIDENCE_REFERENCE",
    ],
  });
});

test("unsupported high-impact fixture cannot force a human gate, while bound conflict can", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const delivery = baseline.candidates.find((candidate) => candidate.orientation === "delivery")!;
  const quality = baseline.candidates.find((candidate) => candidate.orientation === "quality")!;
  const candidates = [
    { ...delivery, id: "candidate-delivery", decisions: delivery.decisions.map((decision, index) => ({ ...decision, evidenceRefs: index === 0 ? ["deliveryRef", "deliverySecondaryRef", "sharedSourceRef"] : [] })) },
    { ...quality, id: "candidate-quality", decisions: quality.decisions.map((decision, index) => ({ ...decision, evidenceRefs: index === 0 ? ["qualityRef", "sharedSourceRef"] : [] })) },
  ];
  // 缺失候选会在 Review 输入边界被整体拒绝；人机门禁仅验证可进入流程的 finding。
  const findings: Finding[] = TIER1_EVIDENCE_FIXTURES.filter((fixture) => !fixture.candidateId).map((fixture) => ({
    id: fixture.id,
    candidateId: fixture.candidateId ?? "candidate-delivery",
    severity: fixture.severity,
    category: "evidence",
    failureScenario: "The finding must be structurally bound to a candidate-owned evidence reference.",
    evidenceRefs: [...fixture.evidenceRefs],
    suggestion: "Use a reference that belongs to the evaluated candidate.",
    relatedCandidateIds: [...fixture.relatedCandidateIds],
  }));
  const result = await runReviewWorkflow({
    analysis,
    plan,
    budget,
    generators: {
      candidate: async ({ orientation }) => candidates.find((candidate) => candidate.orientation === orientation)!,
      review: async () => ({ schemaVersion: 1, findings }),
      evaluate: async () => ({ ...baseline.evaluation, decision: "approved", selectedCandidateId: "candidate-delivery", unresolvedConflicts: [], nextAction: "Send the selected candidate to reporting." }),
    },
  });

  assert.equal(result.evaluation.decision, "needs_human");
  assert.deepEqual(result.evaluation.supportedFindingIds, ["exact-candidate-reference", "multiple-candidate-references", "shared-source-reference", "supported-cross-candidate-conflict"]);
  assert.deepEqual(result.evaluation.ignoredFindingIds, ["empty-evidence", "unknown-reference", "wrong-candidate-reference", "mixed-valid-and-unknown", "mixed-valid-and-wrong-candidate", "duplicate-reference", "duplicate-and-unknown-reference"]);
});

test("Tier 1 reports a missing finding candidate separately from a wrong candidate reference", async () => {
  const baseline = await runReviewWorkflow({ analysis, plan, budget });
  const delivery = baseline.candidates.find((candidate) => candidate.orientation === "delivery")!;
  const validation = validateTier1EvidenceBinding({
    id: "missing-candidate",
    candidateId: "candidate-that-does-not-exist",
    severity: "high",
    category: "evidence",
    failureScenario: "The finding points at a candidate omitted from this review.",
    evidenceRefs: [delivery.decisions[0]!.evidenceRefs[0]!],
    suggestion: "Reference an existing candidate.",
    relatedCandidateIds: [],
  }, baseline.candidates);
  assert.deepEqual(validation, { findingId: "missing-candidate", supported: false, failure: "UNKNOWN_CANDIDATE" });
});
