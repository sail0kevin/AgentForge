import assert from "node:assert/strict";
import test from "node:test";
import type { Chunk } from "./chunker";
import { evaluateGradedRetrieval, hashRetrievalCorpus, type GradedRetrievalFixture } from "./graded-evaluation";

const chunks: Chunk[] = [
  { id: "strong", documentId: "doc", content: "strong evidence", startLine: 0, endLine: 1, metadata: { documentTitle: "Doc", headingPath: "A", sourceVersion: "v1", license: "project" } },
  { id: "weak", documentId: "doc", content: "weak context", startLine: 2, endLine: 3, metadata: { documentTitle: "Doc", headingPath: "A", sourceVersion: "v1", license: "project" } },
  { id: "noise", documentId: "noise", content: "unrelated", startLine: 0, endLine: 1, metadata: { documentTitle: "Noise", headingPath: "B", sourceVersion: "v1", license: "project" } },
];
const fixture: GradedRetrievalFixture = {
  id: "case-1",
  query: "evidence",
  relevantChunks: [{ chunkId: "strong", relevance: 3 }, { chunkId: "weak", relevance: 1 }],
};

test("分级评测只把 relevance >= 2 计为可回答证据，并按等级计算 NDCG", () => {
  const metrics = evaluateGradedRetrieval([fixture], chunks, 2, () => [
    { ...chunks[1], score: 1 },
    { ...chunks[0], score: 0.5 },
  ]);

  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.meanReciprocalRank, 0.5);
  assert.ok(metrics.ndcgAtK > 0 && metrics.ndcgAtK < 1);
  assert.equal(metrics.irrelevantResultRate, 0.5);
  assert.equal(metrics.citationCompleteness, 1);
});

test("分级评测拒绝无效的 k，空 fixture 返回零指标", () => {
  assert.throws(() => evaluateGradedRetrieval([], chunks, 0, () => []), /RAG_GRADED_EVALUATION_K_INVALID/);
  assert.deepEqual(evaluateGradedRetrieval([], chunks, 5, () => []), {
    recallAtK: 0,
    meanReciprocalRank: 0,
    ndcgAtK: 0,
    irrelevantResultRate: 0,
    citationCompleteness: 0,
  });
});

test("正文语料哈希包含内容、位置和元数据", () => {
  const original = hashRetrievalCorpus(chunks);
  const changed = hashRetrievalCorpus([{ ...chunks[0], content: "changed" }, ...chunks.slice(1)]);
  assert.notEqual(original, changed);
});
