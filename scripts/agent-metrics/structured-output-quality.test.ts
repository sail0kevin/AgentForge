import assert from "node:assert/strict";
import test from "node:test";
import { computeStructuredOutputQuality } from "./structured-output-quality";

test("zero workflows → validity=invalid", () => {
  const r = computeStructuredOutputQuality([], "real-model");
  assert.equal(r.validity, "invalid");
  assert.equal(r.data.firstPassCleanRate, null);
});

test("all clean first pass → rate=1", () => {
  const rows = [
    { failuresJson: "[]", currentRound: 0, status: "approved" },
    { failuresJson: "[]", currentRound: 0, status: "approved" },
  ];
  const r = computeStructuredOutputQuality(rows, "real-model");
  assert.equal(r.data.firstPassCleanRate, 1);
  assert.equal(r.validity, "full");
});

test("unknown provenance caps at mechanism-only", () => {
  const rows = [{ failuresJson: "[]", currentRound: 0, status: "approved" }];
  const r = computeStructuredOutputQuality(rows, "unknown");
  assert.equal(r.validity, "mechanism-only");
});

test("revised workflows: recovered vs partial", () => {
  const rows = [
    { failuresJson: "[{\"msg\":\"x\"}]", currentRound: 1, status: "approved" },
    { failuresJson: "[{\"msg\":\"y\"}]", currentRound: 2, status: "partial" },
  ];
  const r = computeStructuredOutputQuality(rows, "real-model");
  assert.equal(r.data.revisedSampleSize, 2);
  assert.equal(r.data.postRevisionRecoveryRate, 0.5);
});

test("malformed failuresJson is treated as empty (no throw)", () => {
  const rows = [{ failuresJson: "not json", currentRound: 0, status: "approved" }];
  const r = computeStructuredOutputQuality(rows, "real-model");
  assert.equal(r.data.firstPassCleanRate, 1);
});
