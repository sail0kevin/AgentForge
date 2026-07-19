import assert from "node:assert/strict";
import test from "node:test";
import { validateBlindCaseManifest } from "./blind-case-manifest";
import { createBlindRunPlan } from "./blind-run-plan";
import { validateBlindStudyAgainstPlan } from "./blind-study-preflight";

const manifest = validateBlindCaseManifest({
  schemaVersion: 1,
  protocolVersion: "p2-4-v1",
  frozenAt: "2026-07-19T12:00:00+08:00",
  cases: ["website", "admin", "learning"].flatMap((category, categoryIndex) =>
    Array.from({ length: 4 }, (_, index) => ({
      caseId: `case-${String(categoryIndex * 4 + index + 1).padStart(2, "0")}`,
      category,
      complexity: index % 2 === 0 ? "medium" : "high",
      requirement: `Build a traceable ${category} workflow with roles, recovery, auditability, measurable acceptance criteria, and implementation detail for preflight case ${index}.`,
      acceptanceFocus: ["workflow", "security", "testing"],
    }))
  ),
});

function input() {
  const plan = createBlindRunPlan(manifest);
  return {
    schemaVersion: 1,
    studyId: "study-2026-01",
    protocolVersion: manifest.protocolVersion,
    minimumCaseCount: 12,
    minimumRaterCount: 2,
    metadata: {
      protocolFrozenAt: manifest.frozenAt,
      caseManifestSha256: plan.caseManifestSha256,
      model: { provider: "test", model: "fixture", promptVersion: "v1", parameters: { temperature: 0 } },
      knowledgeSnapshot: { sourceSetId: "fixture", version: "v1", sha256: "a".repeat(64) },
      budget: { maxInputTokensPerRun: 1000, maxOutputTokensPerRun: 1000, maxCostUsdPerRun: 1 },
    },
    runs: plan.runs.map((run) => ({
      caseId: run.caseId,
      variant: run.variant,
      runId: run.runId,
      title: "Anonymous development report",
      reportMarkdown: "A complete development report with requirements, architecture, risks, tests, evidence, and delivery steps.".repeat(2),
      latencyMs: 100,
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
    })),
  };
}

test("blind study preflight accepts exactly the frozen sixty-run plan", () => {
  assert.equal(validateBlindStudyAgainstPlan(input(), manifest).runs.length, 60);
});

test("blind study preflight rejects a different manifest hash", () => {
  const changed = input();
  changed.metadata.caseManifestSha256 = "b".repeat(64);
  assert.throws(() => validateBlindStudyAgainstPlan(changed, manifest), /BLIND_PREFLIGHT_MANIFEST_HASH/);
});
