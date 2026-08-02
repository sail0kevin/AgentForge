import assert from "node:assert/strict";
import test from "node:test";
import { buildHumanGoldenSetFromTsv, parseAnnotationTsv } from "./human-golden-import";

const digest = "a".repeat(64);

function files() {
  return {
    "sources.tsv": `sourceId\tdocumentId\tdocumentType\tversion\tcontentSha256\tlicense\nsource-architecture\tarchitecture\ttechnical\tv1\t${digest}\tproject\nsource-api\tapi\tapi-reference\tv1\t${digest}\tproject\n`,
    "chunks.tsv": `chunkId\tsourceId\tdocumentId\tcontentSha256\narchitecture-1\tsource-architecture\tarchitecture\t${digest}\napi-1\tsource-api\tapi\t${digest}\n`,
    "cases.tsv": 'caseId\tquery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\nrag-case-recovery\t如何恢复工作流\tmulti-hop\t[{"chunkId":"architecture-1","relevance":3},{"chunkId":"api-1","relevance":2}]\tannotator-a\t2026-08-01T00:00:00+08:00\treviewer-b\t2026-08-01T00:05:00+08:00\tapproved\n',
  };
}

test("TSV 标注包会编译为可追溯且独立审核的人工 Golden Set", () => {
  const dataset = buildHumanGoldenSetFromTsv({
    datasetId: "rag-human-golden-pilot",
    frozenAt: "2026-08-01T01:00:00+08:00",
    snapshotId: "knowledge-pilot-v1",
    files: files(),
  });
  assert.equal(dataset.cases.length, 1);
  assert.equal(dataset.sourceSnapshot.sha256.length, 64);
  assert.equal(dataset.cases[0].relevantChunks[0].relevance, 3);
});

test("TSV 编译拒绝列数错误和无效相关 chunk JSON", () => {
  assert.throws(() => parseAnnotationTsv("a\tb\n1\n", "sources.tsv"), /HUMAN_GOLDEN_TSV_COLUMN_COUNT_INVALID/);
  assert.throws(() => parseAnnotationTsv("a\tb\n", "sources.tsv"), /HUMAN_GOLDEN_TSV_NO_RECORDS/);
  const invalid = files();
  invalid["cases.tsv"] = invalid["cases.tsv"].replace('[{"chunkId":"architecture-1","relevance":3},{"chunkId":"api-1","relevance":2}]', "not-json");
  assert.throws(() => buildHumanGoldenSetFromTsv({
    datasetId: "rag-human-golden-pilot",
    frozenAt: "2026-08-01T01:00:00+08:00",
    snapshotId: "knowledge-pilot-v1",
    files: invalid,
  }), /HUMAN_GOLDEN_TSV_RELEVANCE_JSON_INVALID/);
});
