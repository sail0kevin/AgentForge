import assert from "node:assert/strict";
import { evaluateRetrieval, type RetrievalMetrics } from "../src/lib/rag/evaluation";
import { RAG_GOLDEN_BASELINE, ragGoldenSetManifest } from "../src/lib/rag/golden-set";
import { resumeFixtureChunks, resumeFixtures, resumeNoiseChunks } from "../src/lib/rag/resume-fixtures";

const EPSILON = 1e-12;

// 指标方向不同：召回/MRR/NDCG/引用完整率不能下降，无关结果率不能上升。
function assertNoRegression(name: string, actual: RetrievalMetrics, baseline: RetrievalMetrics) {
  assert.ok(actual.recallAtK + EPSILON >= baseline.recallAtK, `${name}: Recall@k regressed from ${baseline.recallAtK} to ${actual.recallAtK}`);
  assert.ok(actual.meanReciprocalRank + EPSILON >= baseline.meanReciprocalRank, `${name}: MRR regressed from ${baseline.meanReciprocalRank} to ${actual.meanReciprocalRank}`);
  assert.ok(actual.ndcgAtK + EPSILON >= baseline.ndcgAtK, `${name}: NDCG@k regressed from ${baseline.ndcgAtK} to ${actual.ndcgAtK}`);
  assert.ok(actual.citationCompleteness + EPSILON >= baseline.citationCompleteness, `${name}: citation completeness regressed from ${baseline.citationCompleteness} to ${actual.citationCompleteness}`);
  assert.ok(actual.irrelevantResultRate <= baseline.irrelevantResultRate + EPSILON, `${name}: irrelevant result rate regressed from ${baseline.irrelevantResultRate} to ${actual.irrelevantResultRate}`);
}

const actual = {
  cleanRecallAt1: evaluateRetrieval(resumeFixtures, resumeFixtureChunks, 1),
  sharedNoiseRecallAt5: evaluateRetrieval(resumeFixtures, [...resumeFixtureChunks, ...resumeNoiseChunks], 5),
  // 单独保留 k=10 场景，避免把通用 NDCG 函数误表述为已建立 NDCG@10 回归基线。
  sharedNoiseNdcgAt10: evaluateRetrieval(resumeFixtures, [...resumeFixtureChunks, ...resumeNoiseChunks], 10),
};

assertNoRegression("cleanRecallAt1", actual.cleanRecallAt1, RAG_GOLDEN_BASELINE.cleanRecallAt1);
assertNoRegression("sharedNoiseRecallAt5", actual.sharedNoiseRecallAt5, RAG_GOLDEN_BASELINE.sharedNoiseRecallAt5);
assertNoRegression("sharedNoiseNdcgAt10", actual.sharedNoiseNdcgAt10, RAG_GOLDEN_BASELINE.sharedNoiseNdcgAt10);

console.log(JSON.stringify({
  gate: "rag-golden-set",
  status: "passed",
  manifest: ragGoldenSetManifest(),
  baseline: RAG_GOLDEN_BASELINE,
  actual,
  limitation: "Golden Set v0 contains 12 deterministic fixtures. It is a retrieval regression gate, not a large-scale or production-corpus quality claim.",
}, null, 2));
