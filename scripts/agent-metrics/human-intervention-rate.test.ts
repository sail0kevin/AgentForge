import assert from "node:assert/strict";
import test from "node:test";
import { computeHumanInterventionRate } from "./human-intervention-rate";

test("zero workflows → validity=invalid", () => {
  const r = computeHumanInterventionRate([], "real-model");
  assert.equal(r.validity, "invalid");
  assert.equal(r.data.needsHumanDecisionRate, null);
});

test("mixed decisions computed correctly", () => {
  const rows = [
    { evaluationJson: JSON.stringify({ decision: "needs_human" }), currentRound: 2, approvalStatus: "approved" },
    { evaluationJson: JSON.stringify({ decision: "auto" }), currentRound: 0, approvalStatus: "not_required" },
    { evaluationJson: JSON.stringify({ decision: "needs_human" }), currentRound: 1, approvalStatus: "pending" },
  ];
  const r = computeHumanInterventionRate(rows, "real-model");
  assert.equal(r.data.needsHumanDecisionRate, 2 / 3);
  assert.equal(r.data.approvalGateTriggeredRate, 2 / 3);
  assert.equal(r.data.averageRevisionRounds, 1);
  assert.equal(r.validity, "full");
});

test("unknown provenance caps at mechanism-only", () => {
  const rows = [{ evaluationJson: null, currentRound: 0, approvalStatus: "not_required" }];
  const r = computeHumanInterventionRate(rows, "unknown");
  assert.equal(r.validity, "mechanism-only");
});
