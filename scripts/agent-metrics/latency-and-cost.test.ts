import assert from "node:assert/strict";
import test from "node:test";
import { computeLatencyAndCost } from "./latency-and-cost";

const now = new Date("2026-01-01T00:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

test("all-zero latency → bottleneckNodeKey=null with degenerate reason, validity=invalid", () => {
  const r = computeLatencyAndCost({
    nodes: [
      { nodeKey: "a", startedAt: now, finishedAt: now }, // 0ms
      { nodeKey: "b", startedAt: now, finishedAt: now }, // 0ms
    ],
    tokenUsages: [],
  }, "real-model");
  assert.equal(r.data.bottleneckNodeKey, null);
  assert.match(r.data.bottleneckReason ?? "", /degenerate/i);
  assert.equal(r.validity, "invalid");
});

test("all-equal non-zero latency → still degenerate", () => {
  const r = computeLatencyAndCost({
    nodes: [
      { nodeKey: "a", startedAt: now, finishedAt: later(100) },
      { nodeKey: "b", startedAt: now, finishedAt: later(100) },
    ],
    tokenUsages: [],
  }, "real-model");
  assert.equal(r.data.bottleneckNodeKey, null);
  assert.match(r.data.bottleneckReason ?? "", /identical/i);
});

test("distinct latencies → bottleneck is the slowest", () => {
  const r = computeLatencyAndCost({
    nodes: [
      { nodeKey: "fast", startedAt: now, finishedAt: later(50) },
      { nodeKey: "slow", startedAt: now, finishedAt: later(500) },
      { nodeKey: "mid", startedAt: now, finishedAt: later(200) },
    ],
    tokenUsages: [],
  }, "real-model");
  assert.equal(r.data.bottleneckNodeKey, "slow");
  assert.equal(r.data.bottleneckReason, null);
  assert.equal(r.validity, "full");
});

test("zero nodes → bottleneckNodeKey=null, limitation present", () => {
  const r = computeLatencyAndCost({ nodes: [], tokenUsages: [] }, "real-model");
  assert.equal(r.data.bottleneckNodeKey, null);
  assert.match(r.data.bottleneckReason ?? "", /No completed/);
  assert.equal(r.validity, "invalid");
});

test("token usage aggregation across runs", () => {
  const r = computeLatencyAndCost({
    nodes: [{ nodeKey: "a", startedAt: now, finishedAt: later(100) }],
    tokenUsages: [
      { runId: "r1", inputTokens: 100, outputTokens: 50, costUsd: 0.001, costCny: 0.01 },
      { runId: "r1", inputTokens: 200, outputTokens: 100, costUsd: 0.002, costCny: 0.02 },
      { runId: "r2", inputTokens: 50, outputTokens: 25, costUsd: 0.0005, costCny: 0.005 },
    ],
  }, "real-model");
  assert.equal(r.data.tokenUsage.sampleSize, 2);
  assert.equal(r.data.tokenUsage.averageInputTokensPerRun, 175);
  assert.equal(r.data.tokenUsage.averageOutputTokensPerRun, 87.5);
});

test("null runId token rows are skipped", () => {
  const r = computeLatencyAndCost({
    nodes: [{ nodeKey: "a", startedAt: now, finishedAt: later(100) }],
    tokenUsages: [
      { runId: null, inputTokens: 999, outputTokens: 999, costUsd: 9.9, costCny: 99 },
    ],
  }, "real-model");
  assert.equal(r.data.tokenUsage.sampleSize, 0);
});
