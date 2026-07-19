import assert from "node:assert/strict";
import test from "node:test";
import { hashBlindCaseManifest, validateBlindCaseManifest } from "./blind-case-manifest";

const cases = ["website", "admin", "learning"].flatMap((category, categoryIndex) =>
  Array.from({ length: 4 }, (_, index) => ({
    caseId: `case-${String(categoryIndex * 4 + index + 1).padStart(2, "0")}`,
    category,
    complexity: index % 2 === 0 ? "medium" : "high",
    requirement: `Build a traceable ${category} workflow with roles, recovery, auditability, measurable acceptance criteria, and enough detail for implementation case ${index}.`,
    acceptanceFocus: ["workflow", "security", "testing"],
  }))
);

const manifest = {
  schemaVersion: 1,
  protocolVersion: "p2-4-v1",
  frozenAt: "2026-07-19T12:00:00+08:00",
  cases,
};

test("blind case manifest validates twelve balanced unique cases", () => {
  const parsed = validateBlindCaseManifest(manifest);
  assert.equal(parsed.cases.length, 12);
  assert.match(hashBlindCaseManifest(parsed), /^[a-f0-9]{64}$/);
});

test("blind case manifest rejects duplicate case ids", () => {
  const duplicated = structuredClone(manifest);
  duplicated.cases[1].caseId = duplicated.cases[0].caseId;
  assert.throws(() => validateBlindCaseManifest(duplicated), /BLIND_CASE_DUPLICATE/);
});
