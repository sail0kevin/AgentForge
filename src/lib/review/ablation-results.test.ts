import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyAblationRawOutputs } from "./ablation-audit";
import { createAblationRunPlan } from "./ablation-protocol";
import { assertAblationStudyMetadataMatches, hashAblationJson, summarizeAblationAvailability, toPairedMetricObservations, validateAblationResultLedger, validateAblationResultLedgerDraft, type AblationResultLedger } from "./ablation-results";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";
import { ABLATION_LONGCAT_PRICING_SNAPSHOT } from "./ablation-budget";

function plan() {
  return createAblationRunPlan(validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-07-30T00:00:00+08:00",
    cases: Array.from({ length: 20 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "为企业员工建设一个可审计的业务网站，需要权限控制、数据约束、异常处理、自动化测试、性能目标、上线后的监控告警与持续运维能力。",
      checklist: Array.from({ length: 5 }, (_, point) => ({ id: `point-${point}`, description: `关键点 ${point}`, keywords: [`关键点${point}`], isConstraint: false })),
    })),
  }), 1);
}

function ledgerFor(runPlan = plan()): AblationResultLedger {
  const excludedRunId = runPlan.runs[0]!.runId;
  return {
    schemaVersion: 1 as const,
    protocolVersion: "ablation-v2" as const,
    createdAt: "2026-07-30T00:00:00+08:00",
    metadata: {
      provider: "test-provider", model: "test-model", temperature: 0,
      plannerPromptVersion: "planner-v1", reviewPromptVersion: "review-v1", ragSnapshot: "rag-v1",
      caseManifestSha256: runPlan.caseManifestSha256, runPlanSha256: hashAblationJson(runPlan),
      maxEstimatedInputTokensPerCall: 16_000, maxOutputTokensPerCall: 12_000, pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
      maxCostUsdPerRun: 1, maxTotalCostUsd: 100, rawOutputRoot: "local-only/ablation/raw", ledgerPath: "local-only/ablation/ledger.json",
      authorizationPath: "local-only/ablation/execution-authorization.json", authorizationSha256: "b".repeat(64),
    },
    // 固定只排除第一条冻结运行，其他测试可以稳定地验证 results[0] 的边界行为。
    results: runPlan.runs.map((run) => run.runId === excludedRunId ? ({
      ...run, status: "excluded" as const, startedAt: "2026-07-30T00:00:00+08:00", finishedAt: "2026-07-30T00:00:01+08:00", durationMs: 1000,
      coverageRate: null, constraintSatisfactionRate: null, outputSha256: null, rawOutputPath: null, errorCode: "PROVIDER_TIMEOUT",
      inputTokens: 0, outputTokens: 0, costUsd: 0, callCount: 1,
    }) : ({
      ...run, status: "completed" as const, startedAt: "2026-07-30T00:00:00+08:00", finishedAt: "2026-07-30T00:00:01+08:00", durationMs: 1000,
      coverageRate: 0.8, constraintSatisfactionRate: 0.75, outputSha256: "a".repeat(64), rawOutputPath: `local-only/ablation/raw/${run.runId}.txt`, errorCode: null,
      inputTokens: 10, outputTokens: 20, costUsd: 0.01, callCount: 2,
    })),
    inFlightRunId: null,
  };
}

test("ablation ledger binds every result to exactly one frozen run", () => {
  const runPlan = plan();
  const ledger = validateAblationResultLedger(ledgerFor(runPlan), runPlan);
  assert.equal(ledger.results.length, 80);
  assert.equal(summarizeAblationAvailability(ledger)[runPlan.runs[0]!.variant].excluded, 1);
  assert.equal(toPairedMetricObservations(ledger, "coverageRate")[0].value, null);
});

test("ablation draft ledger supports recovery but cannot be reported before completion", () => {
  const runPlan = plan();
  const draft = ledgerFor(runPlan);
  draft.results = draft.results.slice(0, 1);
  assert.equal(validateAblationResultLedgerDraft(draft, runPlan).results.length, 1);
  assert.throws(() => validateAblationResultLedger(draft, runPlan), /ABLATION_RESULT_COUNT_MISMATCH/);

  const unresolved = { ...draft, inFlightRunId: runPlan.runs[1].runId };
  assert.throws(() => validateAblationResultLedger(unresolved, runPlan), /ABLATION_RESULT_COUNT_MISMATCH/);
  const settledInFlight = { ...draft, inFlightRunId: draft.results[0].runId };
  assert.throws(() => validateAblationResultLedgerDraft(settledInFlight, runPlan), /ABLATION_RESULT_IN_FLIGHT_RUN_SETTLED/);
});

test("ablation resume rejects a ledger with different frozen metadata", () => {
  const runPlan = plan();
  const metadata = ledgerFor(runPlan).metadata;
  assert.throws(
    () => assertAblationStudyMetadataMatches({ ...metadata, temperature: 0.3 }, metadata),
    /ABLATION_RESUME_METADATA_MISMATCH/,
  );
});

test("ablation resume rejects a ledger with a different cost authorization fingerprint", () => {
  const runPlan = plan();
  const metadata = ledgerFor(runPlan).metadata;
  assert.throws(
    () => assertAblationStudyMetadataMatches({ ...metadata, authorizationSha256: "c".repeat(64) }, metadata),
    /ABLATION_RESUME_METADATA_MISMATCH/,
  );
});

test("ablation ledger rejects missing, duplicate, and mismatched frozen runs", () => {
  const runPlan = plan();
  const missing = ledgerFor(runPlan);
  missing.results.pop();
  assert.throws(() => validateAblationResultLedger(missing, runPlan), /ABLATION_RESULT_COUNT_MISMATCH/);

  const mismatch = ledgerFor(runPlan);
  mismatch.results[0].caseId = "lw-case-20";
  assert.throws(() => validateAblationResultLedger(mismatch, runPlan), /ABLATION_RESULT_RUN_IDENTITY_MISMATCH/);
});

test("ablation ledger rejects costs above frozen per-run or total ceilings", () => {
  const runPlan = plan();
  const perRunExceeded = ledgerFor(runPlan);
  perRunExceeded.results[1].costUsd = 1.01;
  assert.throws(() => validateAblationResultLedger(perRunExceeded, runPlan), /ABLATION_RESULT_PER_RUN_COST_EXCEEDED/);

  const totalExceeded = ledgerFor(runPlan);
  totalExceeded.metadata.maxCostUsdPerRun = 2;
  totalExceeded.metadata.maxTotalCostUsd = 0.5;
  assert.throws(() => validateAblationResultLedger(totalExceeded, runPlan), /ABLATION_RESULT_TOTAL_COST_EXCEEDED/);
});

test("ablation ledger rejects invalid result timing", () => {
  const runPlan = plan();
  const invalidOrder = ledgerFor(runPlan);
  invalidOrder.results[1].finishedAt = "2026-07-29T23:59:59+08:00";
  assert.throws(() => validateAblationResultLedger(invalidOrder, runPlan), /ABLATION_RESULT_TIME_ORDER_INVALID/);

  const invalidDuration = ledgerFor(runPlan);
  invalidDuration.results[1].durationMs = 999;
  assert.throws(() => validateAblationResultLedger(invalidDuration, runPlan), /ABLATION_RESULT_DURATION_MISMATCH/);
});

test("ablation ledger rejects raw output metadata on an excluded result", () => {
  const runPlan = plan();
  const ledger = ledgerFor(runPlan);
  ledger.results[0].rawOutputPath = "local-only/ablation/raw/not-a-solution.txt";
  assert.throws(() => validateAblationResultLedger(ledger, runPlan), /ABLATION_EXCLUDED_RESULT_INVALID/);
});

test("raw output audit verifies valid files and detects missing, tampered, and escaping files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentforge-ablation-"));
  try {
    const rawRoot = path.join(directory, "raw");
    const outsidePath = path.join(directory, "outside.txt");
    const runPlan = plan();
    const rawPath = path.join(rawRoot, `${runPlan.runs[1].runId}.txt`);
    const ledger = ledgerFor(runPlan);
    ledger.metadata.rawOutputRoot = rawRoot;
    ledger.results = ledger.results.slice(0, 2);
    ledger.inFlightRunId = runPlan.runs[2].runId;
    ledger.results[1].rawOutputPath = rawPath;
    ledger.results[1].outputSha256 = createHash("sha256").update("expected").digest("hex");
    await writeFile(outsidePath, "expected", "utf8");

    await assert.rejects(() => verifyAblationRawOutputs(validateAblationResultLedgerDraft(ledger, runPlan)), /ABLATION_RAW_OUTPUT_ROOT_MISSING/);
    await mkdir(rawRoot, { recursive: true });
    await assert.rejects(() => verifyAblationRawOutputs(validateAblationResultLedgerDraft(ledger, runPlan)), /ABLATION_RAW_OUTPUT_MISSING/);
    await writeFile(rawPath, "expected", "utf8");
    assert.deepEqual(
      await verifyAblationRawOutputs(validateAblationResultLedgerDraft(ledger, runPlan)),
      { verifiedCompletedRunCount: 1 },
    );
    await writeFile(rawPath, "wrong", "utf8");
    await assert.rejects(() => verifyAblationRawOutputs(validateAblationResultLedgerDraft(ledger, runPlan)), /ABLATION_RAW_OUTPUT_HASH_MISMATCH/);

    ledger.results[1].rawOutputPath = outsidePath;
    await assert.rejects(() => verifyAblationRawOutputs(validateAblationResultLedgerDraft(ledger, runPlan)), /ABLATION_RAW_OUTPUT_PATH_OUTSIDE_ROOT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
