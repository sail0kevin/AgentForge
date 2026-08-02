import assert from "node:assert/strict";
import test from "node:test";
import { convertReviewedWorklistToCasesTsv } from "./human-golden-worklist-import";

const header = "taskId\tdocumentType\tsourceId\tdocumentId\tchunkId\tstartLine\tendLine\tqueryTypeHints\tchunkPreview\tcaseId\thumanQuery\tqueryType\trelevantChunksJson\tannotatedBy\tannotatedAt\treviewedBy\treviewedAt\treviewStatus\tnotes\n";

function row(overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    taskId: "rag-worklist-0001",
    documentType: "technical",
    sourceId: "source-architecture",
    documentId: "architecture",
    chunkId: "architecture-1",
    startLine: "1",
    endLine: "8",
    queryTypeHints: "troubleshooting,semantic,multi-hop",
    chunkPreview: "Checkpoint recovery details.",
    caseId: "",
    humanQuery: "工作流中断后如何恢复？",
    queryType: "troubleshooting",
    relevantChunksJson: '[{"chunkId":"architecture-1","relevance":3}]',
    annotatedBy: "annotator-a",
    annotatedAt: "2026-08-02T09:00:00+08:00",
    reviewedBy: "reviewer-b",
    reviewedAt: "2026-08-02T09:30:00+08:00",
    reviewStatus: "approved",
    notes: "",
    ...overrides,
  };
  return [
    values.taskId,
    values.documentType,
    values.sourceId,
    values.documentId,
    values.chunkId,
    values.startLine,
    values.endLine,
    values.queryTypeHints,
    values.chunkPreview,
    values.caseId,
    values.humanQuery,
    values.queryType,
    values.relevantChunksJson,
    values.annotatedBy,
    values.annotatedAt,
    values.reviewedBy,
    values.reviewedAt,
    values.reviewStatus,
    values.notes,
  ].join("\t");
}

test("approved worklist rows convert to cases.tsv without inventing annotation fields", () => {
  const result = convertReviewedWorklistToCasesTsv(`${header}${row()}\n`, {
    minimumApprovedCount: 1,
  });

  assert.equal(result.approvedCaseCount, 1);
  assert.equal(result.skippedRowCount, 0);
  assert.deepEqual(result.sourceRowNumbers, [2]);
  assert.match(result.casesTsv, /^caseId\tquery\tqueryType\t/);
  assert.match(result.casesTsv, /rag-case-0001\t工作流中断后如何恢复？\ttroubleshooting\t/);
  assert.doesNotMatch(result.casesTsv, /chunkPreview/);
});

test("blank and rejected worklist rows are skipped instead of becoming cases", () => {
  assert.throws(() => convertReviewedWorklistToCasesTsv([
    header.trimEnd(),
    row({ reviewStatus: "" }),
    row({ taskId: "rag-worklist-0002", reviewStatus: "rejected" }),
    "",
  ].join("\n")), /RAG_HUMAN_GOLDEN_WORKLIST_APPROVED_COUNT_BELOW_MINIMUM: 0 < 1/);
});

test("approved worklist rows require independent review and selected chunk relevance", () => {
  assert.throws(() => convertReviewedWorklistToCasesTsv(`${header}${row({ reviewedBy: "annotator-a" })}\n`), /RAG_HUMAN_GOLDEN_WORKLIST_REVIEW_NOT_INDEPENDENT/);
  assert.throws(() => convertReviewedWorklistToCasesTsv(`${header}${row({ relevantChunksJson: '[{"chunkId":"other","relevance":3}]' })}\n`), /RAG_HUMAN_GOLDEN_WORKLIST_SELECTED_CHUNK_NOT_RELEVANT/);
  assert.throws(() => convertReviewedWorklistToCasesTsv(`${header}${row({ queryType: "" })}\n`), /RAG_HUMAN_GOLDEN_WORKLIST_APPROVED_FIELD_MISSING/);
});
