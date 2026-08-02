import assert from "node:assert/strict";
import test from "node:test";
import type { Chunk } from "./chunker";
import { evaluateRetrieval, type RetrievalFixture } from "./evaluation";

const metadata = (title: string, headingPath: string) => ({ documentTitle: title, headingPath, sourceVersion: "1", license: "project" });
const chunks: Chunk[] = [
  { id: "admin-rbac", documentId: "admin", content: "租户管理员采用角色权限矩阵，并记录审计日志。", startLine: 4, endLine: 8, metadata: metadata("后台设计", "安全 > 角色权限") },
  { id: "form-errors", documentId: "web", content: "联系表单需要可见标签、字段错误和页级错误摘要。", startLine: 10, endLine: 13, metadata: metadata("官网规范", "可访问性 > 表单") },
  { id: "study-timer", documentId: "learning", content: "番茄计时支持开始、暂停、恢复和异常状态恢复。", startLine: 20, endLine: 24, metadata: metadata("学习工具", "计时 > 状态机") },
];
const fixtures: RetrievalFixture[] = [
  { id: "rbac", query: "管理员角色权限审计", relevantChunkIds: ["admin-rbac"] },
  { id: "form", query: "表单字段错误摘要", relevantChunkIds: ["form-errors"] },
  { id: "timer", query: "番茄计时暂停恢复", relevantChunkIds: ["study-timer"] },
];

test("fixed retrieval fixtures report recall, MRR, NDCG, irrelevant rate and citation completeness", () => {
  const metrics = evaluateRetrieval(fixtures, chunks, 1);
  assert.deepEqual(metrics, { recallAtK: 1, meanReciprocalRank: 1, ndcgAtK: 1, irrelevantResultRate: 0, citationCompleteness: 1 });
});

test("NDCG rewards placing relevant evidence before irrelevant results", () => {
  const retriever = () => [
    { ...chunks[1], score: 1 },
    { ...chunks[0], score: 0.5 },
  ];
  const metrics = evaluateRetrieval([fixtures[0]], chunks, 2, retriever);

  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.meanReciprocalRank, 0.5);
  assert.ok(Math.abs(metrics.ndcgAtK - (1 / Math.log2(3))) < 1e-12);
});

test("empty fixture set returns zero-valued retrieval metrics", () => {
  assert.deepEqual(evaluateRetrieval([], chunks), {
    recallAtK: 0,
    meanReciprocalRank: 0,
    ndcgAtK: 0,
    irrelevantResultRate: 0,
    citationCompleteness: 0,
  });
});
