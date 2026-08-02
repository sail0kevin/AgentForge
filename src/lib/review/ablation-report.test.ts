import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createAblationRunPlan } from "./ablation-protocol";
import { hashAblationJson, type AblationResultLedger } from "./ablation-results";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";
import { ABLATION_LONGCAT_PRICING_SNAPSHOT } from "./ablation-budget";

const execFile = promisify(execFileCallback);

function createManifest() {
  return validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-08-01T00:00:00+08:00",
    cases: Array.from({ length: 20 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "建设一个可审计的业务网站，覆盖权限控制、数据约束、异常处理、自动化测试和上线后的运行维护能力，并要求具备日志、监控、告警、回滚和持续改进机制。",
      checklist: Array.from({ length: 5 }, (_, point) => ({
        id: `report-point-${point}`,
        description: `关键验收点 ${point}`,
        keywords: [`验收点${point}`],
        isConstraint: false,
      })),
    })),
  });
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function excludedLedger(runPlan: ReturnType<typeof createAblationRunPlan>, paths: {
  authorizationPath: string;
  rawOutputRoot: string;
  ledgerPath: string;
  authorizationSha256: string;
}): AblationResultLedger {
  return {
    schemaVersion: 1,
    protocolVersion: "ablation-v2",
    createdAt: "2026-08-01T00:00:00+08:00",
    metadata: {
      provider: "longcat-openai-compatible",
      model: "offline-test-model",
      temperature: 0,
      plannerPromptVersion: "planner-offline-v1",
      reviewPromptVersion: "review-offline-v1",
      ragSnapshot: "offline-rag-v1",
      caseManifestSha256: runPlan.caseManifestSha256,
      runPlanSha256: hashAblationJson(runPlan),
      maxEstimatedInputTokensPerCall: 16_000,
      maxOutputTokensPerCall: 12_000,
      pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
      maxCostUsdPerRun: 1,
      maxTotalCostUsd: 100,
      rawOutputRoot: paths.rawOutputRoot,
      ledgerPath: paths.ledgerPath,
      authorizationPath: paths.authorizationPath,
      authorizationSha256: paths.authorizationSha256,
    },
    // 全部运行都明确标记为 excluded，只验证报告和授权链，不伪造任何质量分数。
    results: runPlan.runs.map((run) => ({
      ...run,
      status: "excluded" as const,
      startedAt: "2026-08-01T00:00:00+08:00",
      finishedAt: "2026-08-01T00:00:01+08:00",
      durationMs: 1000,
      coverageRate: null,
      constraintSatisfactionRate: null,
      outputSha256: null,
      rawOutputPath: null,
      errorCode: "OFFLINE_FIXTURE_EXCLUDED",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      callCount: 0,
    })),
    inFlightRunId: null,
  };
}

async function runReport(planPath: string, ledgerPath: string) {
  const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
  return execFile(process.execPath, [cli, "scripts/agent-ablation-report.ts", "--plan", planPath, "--ledger", ledgerPath], {
    cwd: process.cwd(),
  });
}

test("ablation report CLI binds the authorization file and rejects tampering", async () => {
  // 使用工作区 local-only，满足报告 CLI 对私有路径的真实边界检查。
  const directory = await mkdtemp(path.resolve("local-only", "ablation-report-test-"));
  try {
    const rawOutputRoot = path.join(directory, "raw");
    const planPath = path.join(directory, "run-plan.json");
    const ledgerPath = path.join(directory, "result-ledger.json");
    const authorizationPath = path.join(directory, "execution-authorization.json");
    await mkdir(rawOutputRoot, { recursive: true });

    const runPlan = createAblationRunPlan(createManifest(), 1, 20260801);
    await writeFile(planPath, JSON.stringify(runPlan), "utf8");
    const authorization = {
      schemaVersion: 2,
      status: "approved",
      approvedBy: "offline-test",
      approvedAt: "2026-08-01T00:00:00+08:00",
      provider: "longcat-openai-compatible",
      model: "offline-test-model",
      temperature: 0,
      plannerPromptVersion: "planner-offline-v1",
      reviewPromptVersion: "review-offline-v1",
      ragSnapshot: "offline-rag-v1",
      caseManifestSha256: runPlan.caseManifestSha256,
      runPlanSha256: hashAblationJson(runPlan),
      maxEstimatedInputTokensPerCall: 16_000,
      maxOutputTokensPerCall: 12_000,
      pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
      maxCostUsdPerRun: 1,
      maxTotalCostUsd: 100,
      rawOutputRoot,
      ledgerPath,
    };
    const authorizationContent = JSON.stringify(authorization, null, 2);
    await writeFile(authorizationPath, authorizationContent, "utf8");
    await writeFile(ledgerPath, JSON.stringify(excludedLedger(runPlan, {
      authorizationPath,
      rawOutputRoot,
      ledgerPath,
      authorizationSha256: sha256(authorizationContent),
    })), "utf8");

    const report = await runReport(planPath, ledgerPath);
    assert.match(report.stdout, /"status": "measured_from_ledger"/);

    await writeFile(authorizationPath, authorizationContent.replace("offline-test", "tampered-approval"), "utf8");
    await assert.rejects(
      () => runReport(planPath, ledgerPath),
      (error: unknown) => {
        const stderr = typeof error === "object" && error !== null && "stderr" in error
          ? String(error.stderr)
          : String(error);
        assert.match(stderr, /ABLATION_AUTHORIZATION_HASH_MISMATCH/);
        return true;
      },
    );

    // 确认测试过程没有偷偷生成任何原始模型输出文件。
    assert.equal((await readFile(ledgerPath, "utf8")).includes("OFFLINE_FIXTURE_EXCLUDED"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
