import assert from "node:assert/strict";
import test from "node:test";
import { PilotFeedbackInputSchema, mapPilotFeedback } from "./feedback";

test("pilot feedback requires an intervention reason when a user edited the report", () => {
  const parsed = PilotFeedbackInputSchema.safeParse({
    reportUsability: "usable_with_edits",
    humanEdited: true,
    evidenceIssueType: "missing_evidence",
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues[0]?.message ?? "", /干预原因/);
});

test("pilot feedback accepts structured categories without saving raw artifacts", () => {
  const parsed = PilotFeedbackInputSchema.parse({
    reportUsability: "not_usable",
    humanEdited: true,
    interventionReason: "risk_confirmation",
    evidenceIssueType: "outdated_evidence",
    failureCategory: "report_quality",
    note: "需要补充当前版本的接口约束。",
  });

  assert.deepEqual(parsed, {
    reportUsability: "not_usable",
    humanEdited: true,
    interventionReason: "risk_confirmation",
    evidenceIssueType: "outdated_evidence",
    failureCategory: "report_quality",
    note: "需要补充当前版本的接口约束。",
  });
});

test("pilot feedback mapper serializes dates and validates persisted enum values", () => {
  const mapped = mapPilotFeedback({
    id: "feedback-1",
    workflowId: "workflow-1",
    reportUsability: "usable_without_edits",
    humanEdited: false,
    interventionReason: null,
    evidenceIssueType: "none",
    failureCategory: "none",
    note: null,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T01:00:00.000Z"),
  });

  assert.equal(mapped.createdAt, "2026-08-02T00:00:00.000Z");
  assert.equal(mapped.evidenceIssueType, "none");
  assert.equal(mapped.note, null);
});
