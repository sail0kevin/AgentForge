import assert from "node:assert/strict";
import test from "node:test";
import { assessHumanGoldenSetReadiness, summarizeHumanGoldenSet, validateHumanGoldenSet } from "./human-golden-set";

const digest = "a".repeat(64);

function validDataset() {
  return {
    schemaVersion: 1,
    datasetId: "rag-human-golden-2026-08",
    frozenAt: "2026-08-01T00:00:00+08:00",
    sourceSnapshot: { snapshotId: "knowledge-2026-08", sha256: digest },
    sources: [
      { sourceId: "source-architecture", documentId: "architecture", documentType: "technical", version: "v1", contentSha256: digest, license: "project" },
      { sourceId: "source-api", documentId: "api", documentType: "api-reference", version: "v1", contentSha256: digest, license: "project" },
    ],
    chunks: [
      { chunkId: "architecture-1", sourceId: "source-architecture", documentId: "architecture", contentSha256: digest },
      { chunkId: "api-1", sourceId: "source-api", documentId: "api", contentSha256: digest },
    ],
    cases: [{
      caseId: "rag-case-recovery-api",
      query: "如何恢复中断的工作流？",
      queryType: "multi-hop",
      relevantChunks: [{ chunkId: "architecture-1", relevance: 3 }, { chunkId: "api-1", relevance: 2 }],
      annotatedBy: "annotator-a",
      annotatedAt: "2026-08-01T00:00:00+08:00",
      reviewedBy: "reviewer-b",
      reviewedAt: "2026-08-01T00:05:00+08:00",
      reviewStatus: "approved",
    }],
  };
}

test("human Golden Set accepts approved, traceable and independently reviewed annotations", () => {
  const dataset = validateHumanGoldenSet(validDataset());
  const report = summarizeHumanGoldenSet(dataset);
  assert.equal(report.caseCount, 1);
  assert.equal(report.multiSourceCaseCount, 1);
  assert.equal(report.relevanceLevels["3"], 1);
  assert.match(report.limitation, /does not calculate retrieval quality/);
});

test("human Golden Set rejects untraceable, duplicate or self-reviewed annotations", () => {
  const unknownChunk = validDataset();
  unknownChunk.cases[0].relevantChunks[0].chunkId = "missing";
  assert.throws(() => validateHumanGoldenSet(unknownChunk), /HUMAN_GOLDEN_RELEVANCE_CHUNK_UNKNOWN/);

  const duplicateQuery = validDataset();
  duplicateQuery.cases.push({ ...duplicateQuery.cases[0], caseId: "rag-case-duplicate", query: "  如何恢复中断的工作流？ " });
  assert.throws(() => validateHumanGoldenSet(duplicateQuery), /HUMAN_GOLDEN_QUERY_DUPLICATE/);

  const selfReviewed = validDataset();
  selfReviewed.cases[0].reviewedBy = "annotator-a";
  assert.throws(() => validateHumanGoldenSet(selfReviewed), /HUMAN_GOLDEN_REVIEW_NOT_INDEPENDENT/);
});

test("human Golden Set readiness does not treat a contract-valid small dataset as an evaluation benchmark", () => {
  const dataset = validateHumanGoldenSet(validDataset());
  const insufficient = assessHumanGoldenSetReadiness(dataset);
  assert.equal(insufficient.eligibleForRetrievalEvaluation, false);
  assert.match(insufficient.readinessIssues[0], /below the required minimum 100/);

  const readyForSmallPilot = assessHumanGoldenSetReadiness(dataset, 1);
  assert.equal(readyForSmallPilot.eligibleForRetrievalEvaluation, false);
  assert.match(readyForSmallPilot.readinessIssues.at(-1)!, /business source document/);

  const readyWithPilotScope = assessHumanGoldenSetReadiness(dataset, 1, ["technical", "api-reference"]);
  assert.equal(readyWithPilotScope.eligibleForRetrievalEvaluation, true);
  assert.deepEqual(readyWithPilotScope.readinessIssues, []);
  assert.throws(() => assessHumanGoldenSetReadiness(dataset, 0), /HUMAN_GOLDEN_MINIMUM_CASE_COUNT_INVALID/);
});
