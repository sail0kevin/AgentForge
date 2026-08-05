import assert from "node:assert/strict";
import test from "node:test";
import { computeEvidenceSupportRate } from "./evidence-support-rate";

test("zero workflows → validity=invalid", () => {
  const r = computeEvidenceSupportRate([], "real-model");
  assert.equal(r.validity, "invalid");
  assert.equal(r.data.evidenceSupportRate, null);
});

test("all supported → rate=1", () => {
  const rows = [
    { evaluationJson: JSON.stringify({ supportedFindingIds: ["f1", "f2"], ignoredFindingIds: [] }) },
  ];
  const r = computeEvidenceSupportRate(rows, "real-model");
  assert.equal(r.data.evidenceSupportRate, 1);
  assert.equal(r.validity, "full");
});

test("null evaluationJson is skipped", () => {
  const rows = [
    { evaluationJson: null },
    { evaluationJson: JSON.stringify({ supportedFindingIds: ["f1"], ignoredFindingIds: ["f2"] }) },
  ];
  const r = computeEvidenceSupportRate(rows, "real-model");
  assert.equal(r.data.totalFindings, 2);
  assert.equal(r.data.evidenceSupportRate, 0.5);
});

test("workflows with zero findings are skipped from rate but counted in sampleSize", () => {
  const rows = [
    { evaluationJson: JSON.stringify({ supportedFindingIds: [], ignoredFindingIds: [] }) },
    { evaluationJson: JSON.stringify({ supportedFindingIds: ["f1"], ignoredFindingIds: [] }) },
  ];
  const r = computeEvidenceSupportRate(rows, "real-model");
  assert.equal(r.data.sampleSize, 2);
  assert.equal(r.data.workflowsWithFindings, 1);
  assert.equal(r.data.evidenceSupportRate, 1);
});
