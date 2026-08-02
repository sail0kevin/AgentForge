import assert from "node:assert/strict";
import test from "node:test";
import { selectRrfTuningCandidate } from "./rrf-tuning";

const metrics = {
  recallAtK: 0.8,
  meanReciprocalRank: 0.7,
  ndcgAtK: 0.75,
  irrelevantResultRate: 0.2,
  citationCompleteness: 1,
};

test("RRF 调优按冻结的多级规则选择候选参数", () => {
  const decision = selectRrfTuningCandidate([
    { rrfK: 60, metrics },
    { rrfK: 45, metrics: { ...metrics, ndcgAtK: 0.8 } },
    { rrfK: 30, metrics: { ...metrics, recallAtK: 0.9, irrelevantResultRate: 0.4 } },
  ]);

  assert.equal(decision.selected.rrfK, 30);
  assert.deepEqual(decision.candidates.map((candidate) => candidate.rrfK), [30, 45, 60]);
  assert.match(decision.selectionPolicy, /Recall@K/);
});

test("RRF 调优在全部指标相同时选择较小 k，并拒绝不完整候选集", () => {
  const decision = selectRrfTuningCandidate([{ rrfK: 90, metrics }, { rrfK: 30, metrics }]);
  assert.equal(decision.selected.rrfK, 30);
  assert.throws(() => selectRrfTuningCandidate([]), /RAG_RRF_TUNING_CANDIDATES_REQUIRED/);
  assert.throws(() => selectRrfTuningCandidate([{ rrfK: 0, metrics }]), /RAG_RRF_TUNING_K_INVALID/);
  assert.throws(() => selectRrfTuningCandidate([{ rrfK: 30, metrics }, { rrfK: 30, metrics }]), /RAG_RRF_TUNING_K_DUPLICATE/);
});
