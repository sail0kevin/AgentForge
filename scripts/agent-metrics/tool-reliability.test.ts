import assert from "node:assert/strict";
import test from "node:test";
import { computeToolReliability } from "./tool-reliability";

test("zero invocations → validity=invalid, all rates null", () => {
  const r = computeToolReliability([], "real-model");
  assert.equal(r.validity, "invalid");
  assert.equal(r.data.sampleSize, 0);
  assert.equal(r.data.successRate, null);
});

test("all-zero with real-model still invalid (zero sample)", () => {
  const r = computeToolReliability([], "real-model");
  assert.equal(r.validity, "invalid");
});

test("unknown provenance caps at mechanism-only even with good data", () => {
  const rows = [
    { status: "completed", errorCode: null, replayed: false, toolId: "t1" },
    { status: "completed", errorCode: null, replayed: true, toolId: "t1" },
    { status: "failed", errorCode: "ERR", replayed: false, toolId: "t2" },
  ];
  const r = computeToolReliability(rows, "unknown");
  assert.equal(r.validity, "mechanism-only");
  assert.equal(r.data.successRate, 2 / 3);
  assert.equal(r.data.replayHitRate, 1 / 3);
});

test("stub provenance → mechanism-only", () => {
  const rows = [{ status: "completed", errorCode: null, replayed: false, toolId: "t1" }];
  const r = computeToolReliability(rows, "stub");
  assert.equal(r.validity, "mechanism-only");
});

test("real-model provenance + good data → full", () => {
  const rows = [{ status: "completed", errorCode: null, replayed: false, toolId: "t1" }];
  const r = computeToolReliability(rows, "real-model");
  assert.equal(r.validity, "full");
});

test("byToolId breakdown is per-tool", () => {
  const rows = [
    { status: "completed", errorCode: null, replayed: false, toolId: "t1" },
    { status: "failed", errorCode: "E1", replayed: false, toolId: "t1" },
    { status: "completed", errorCode: null, replayed: false, toolId: "t2" },
  ];
  const r = computeToolReliability(rows, "real-model");
  assert.equal(r.data.byToolId.t1.successRate, 0.5);
  assert.equal(r.data.byToolId.t2.successRate, 1);
  assert.deepEqual(r.data.errorCodeBreakdown, { E1: 1 });
});
