import assert from "node:assert/strict";
import test from "node:test";
import { inspectHumanGoldenAnnotationPackage } from "./human-golden-status";

const digest = "a".repeat(64);

function files(cases = "caseId\tquery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\n") {
  return {
    "sources.tsv": [
      "sourceId\tdocumentId\tdocumentType\tversion\tcontentSha256\tlicense\n",
      `source-architecture\tarchitecture\ttechnical\tv1\t${digest}\tproject\n`,
      `source-api\tapi\tapi-reference\tv1\t${digest}\tproject\n`,
      `source-market\tmarket\tbusiness\tv1\t${digest}\tproject\n`,
    ].join(""),
    "chunks.tsv": [
      "chunkId\tsourceId\tdocumentId\tcontentSha256\n",
      `architecture-1\tsource-architecture\tarchitecture\t${digest}\n`,
      `api-1\tsource-api\tapi\t${digest}\n`,
      `market-1\tsource-market\tmarket\t${digest}\n`,
    ].join(""),
    "cases.tsv": cases,
  };
}

function validCase(caseId = "rag-case-recovery") {
  return [
    "caseId\tquery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\n",
    `${caseId}\tHow to recover interrupted workflow?\tmulti-hop\t[{"chunkId":"architecture-1","relevance":3},{"chunkId":"api-1","relevance":2}]\tannotator-a\t2026-08-01T00:00:00+08:00\treviewer-b\t2026-08-01T00:05:00+08:00\tapproved\n`,
  ].join("");
}

test("human Golden Set status reports an empty annotation package as not ready without inventing metrics", () => {
  const report = inspectHumanGoldenAnnotationPackage({
    files: files(),
    minimumCaseCount: 1,
  });
  assert.equal(report.status, "not_ready");
  assert.equal(report.caseRowCount, 0);
  assert.equal(report.validCaseCount, 0);
  assert.equal(report.invalidCaseCount, 0);
  assert.equal(report.eligibleForBuild, false);
  assert.equal(report.eligibleForRetrievalEvaluation, false);
  assert.match(report.readinessIssues[0], /no human-annotated query rows/);
  assert.match(report.limitation, /does not calculate Recall@5/);
});

test("human Golden Set status separates ready annotation packages from retrieval metrics", () => {
  const report = inspectHumanGoldenAnnotationPackage({
    files: files(validCase()),
    minimumCaseCount: 1,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.caseRowCount, 1);
  assert.equal(report.validCaseCount, 1);
  assert.equal(report.invalidCaseCount, 0);
  assert.equal(report.eligibleForBuild, true);
  assert.equal(report.eligibleForRetrievalEvaluation, true);
  assert.deepEqual(report.readinessIssues, []);
});

test("human Golden Set status reports row-level annotation problems", () => {
  const badCase = validCase().replace("[{\"chunkId\":\"architecture-1\",\"relevance\":3},{\"chunkId\":\"api-1\",\"relevance\":2}]", "not-json");
  const report = inspectHumanGoldenAnnotationPackage({
    files: files(badCase),
    minimumCaseCount: 1,
  });
  assert.equal(report.status, "invalid");
  assert.equal(report.caseRowCount, 1);
  assert.equal(report.validCaseCount, 0);
  assert.equal(report.invalidCaseCount, 1);
  assert.equal(report.eligibleForBuild, false);
  assert.equal(report.eligibleForRetrievalEvaluation, false);
  assert.equal(report.errors[0].fileName, "cases.tsv");
  assert.equal(report.errors[0].rowNumber, 2);
  assert.equal(report.errors[0].code, "HUMAN_GOLDEN_TSV_RELEVANCE_JSON_INVALID");
});
