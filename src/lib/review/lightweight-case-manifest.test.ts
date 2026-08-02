import assert from "node:assert/strict";
import test from "node:test";
import { hashLightweightCaseManifest, validateLightweightCaseManifest } from "./lightweight-case-manifest";

function buildCase(index: number) {
  const categories = ["ecommerce", "content-platform", "internal-admin", "website", "learning"] as const;
  return {
    caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
    category: categories[index % categories.length],
    complexity: index % 2 === 0 ? "medium" as const : "high" as const,
    requirement: `Plan a real-world project with roles, recovery, auditability, and measurable acceptance criteria, detailed enough to implement, case number ${index}.`,
    checklist: [
      { id: "point-1", description: "覆盖角色权限", keywords: ["权限", "角色"], isConstraint: false },
      { id: "point-2", description: "覆盖审计日志", keywords: ["审计", "日志"], isConstraint: false },
      { id: "point-3", description: "覆盖并发限制", keywords: ["并发", "限流"], isConstraint: true },
      { id: "point-4", description: "覆盖异常恢复", keywords: ["恢复", "重试"], isConstraint: false },
      { id: "point-5", description: "覆盖验收标准", keywords: ["验收", "测试用例"], isConstraint: false },
    ],
  };
}

const cases = Array.from({ length: 20 }, (_, index) => buildCase(index));
const manifest = { schemaVersion: 1 as const, protocolVersion: "lw-v1", frozenAt: "2026-07-24T00:00:00+08:00", cases };

test("lightweight case manifest validates twenty to thirty cases with unique checklist ids", () => {
  const parsed = validateLightweightCaseManifest(manifest);
  assert.equal(parsed.cases.length, 20);
  assert.match(hashLightweightCaseManifest(parsed), /^[a-f0-9]{64}$/);
});

test("lightweight case manifest rejects duplicate case ids", () => {
  const duplicated = structuredClone(manifest);
  duplicated.cases[1].caseId = duplicated.cases[0].caseId;
  assert.throws(() => validateLightweightCaseManifest(duplicated), /LIGHTWEIGHT_CASE_DUPLICATE/);
});

test("lightweight case manifest rejects duplicate checklist ids within a case", () => {
  const duplicated = structuredClone(manifest);
  duplicated.cases[0].checklist[1].id = duplicated.cases[0].checklist[0].id;
  assert.throws(() => validateLightweightCaseManifest(duplicated), /LIGHTWEIGHT_CASE_CHECKLIST_DUPLICATE/);
});

test("lightweight case manifest rejects fewer than twenty cases", () => {
  const tooFew = { ...manifest, cases: cases.slice(0, 10) };
  assert.throws(() => validateLightweightCaseManifest(tooFew));
});
