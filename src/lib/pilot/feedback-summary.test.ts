import assert from "node:assert/strict";
import test from "node:test";
import { summarizePilotFeedback } from "./feedback-summary";

function record(overrides: Partial<Parameters<typeof summarizePilotFeedback>[0][number]> = {}) {
  return {
    reportUsability: "usable_without_edits",
    humanEdited: false,
    interventionReason: "not_needed",
    evidenceIssueType: "none",
    failureCategory: "none",
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T01:00:00.000Z"),
    ...overrides,
  };
}

test("pilot feedback summary keeps empty samples explicitly not ready", () => {
  const summary = summarizePilotFeedback([]);

  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.rates.usableReportRate, null);
  assert.equal(summary.observationWindow.firstFeedbackAt, null);
  assert.equal(summary.conclusionReadiness.status, "not_ready");
});

test("pilot feedback summary calculates distributions and rates without raw feedback content", () => {
  const summary = summarizePilotFeedback([
    record(),
    record({
      reportUsability: "usable_with_edits",
      humanEdited: true,
      interventionReason: "risk_confirmation",
      evidenceIssueType: "missing_evidence",
      failureCategory: "review_quality",
      updatedAt: new Date("2026-08-03T01:00:00.000Z"),
    }),
    record({
      reportUsability: "not_usable",
      humanEdited: true,
      interventionReason: "missing_context",
      evidenceIssueType: "incorrect_evidence",
      failureCategory: "report_quality",
    }),
  ]);

  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.reportUsability.usable_without_edits, 1);
  assert.equal(summary.reportUsability.not_usable, 1);
  assert.equal(summary.interventionReason.risk_confirmation, 1);
  assert.equal(summary.rates.usableReportRate, 2 / 3);
  assert.equal(summary.rates.humanEditedRate, 2 / 3);
  assert.equal(summary.rates.notUsableRate, 1 / 3);
  assert.equal(summary.observationWindow.lastFeedbackAt, "2026-08-03T01:00:00.000Z");
  assert.equal(JSON.stringify(summary).includes("note"), false);
  assert.equal(JSON.stringify(summary).includes("workflowId"), false);
});

test("pilot feedback summary masks unexpected persisted enum values", () => {
  const summary = summarizePilotFeedback([
    record({
      reportUsability: "unexpected-private-value",
      interventionReason: "unexpected-private-value",
    }),
  ]);

  assert.equal(summary.reportUsability.invalid_persisted_value, 1);
  assert.equal(summary.interventionReason.invalid_persisted_value, 1);
  assert.equal(summary.dataQuality.invalidPersistedValueCount, 2);
  assert.equal(JSON.stringify(summary).includes("unexpected-private-value"), false);
});

test("pilot feedback summary only becomes descriptive after its configured sample threshold", () => {
  const records = Array.from({ length: 2 }, () => record());

  assert.equal(summarizePilotFeedback(records, 3).conclusionReadiness.status, "not_ready");
  assert.equal(summarizePilotFeedback(records, 2).conclusionReadiness.status, "descriptive_only");
  assert.throws(() => summarizePilotFeedback(records, 0), /PILOT_FEEDBACK_MINIMUM_SAMPLE_SIZE_INVALID/);
});
