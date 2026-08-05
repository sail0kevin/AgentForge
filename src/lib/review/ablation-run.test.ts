import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createAblationRunPlan } from "./ablation-protocol";
import { hashAblationJson } from "./ablation-results";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";

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
      requirement: "构建一个具备权限控制、数据约束、异常处理、自动化测试、日志、监控、告警、回滚和持续改进机制的可审计业务网站，并提供明确的验收标准、上线流程和运行维护责任边界。",
      checklist: Array.from({ length: 5 }, (_, point) => ({
        id: `point-${point}`,
        description: `关键验收点 ${point}`,
        keywords: [`验收点 ${point}`],
        isConstraint: false,
      })),
    })),
  });
}

test("ablation run preflight rejects an insufficient frozen-study budget before provider configuration", async () => {
  // 测试不提供 LongCat 凭证；预算错误必须先于任何 Provider 环境变量读取发生。
  const directory = await mkdtemp(path.resolve("local-only", "ablation-run-test-"));
  try {
    const manifest = createManifest();
    const plan = createAblationRunPlan(manifest, 1, 20260801);
    const planPath = path.join(directory, "run-plan.json");
    const manifestPath = path.join(directory, "manifest.json");
    const ledgerPath = path.join(directory, "result-ledger.json");
    const rawOutputRoot = path.join(directory, "raw");
    await Promise.all([
      writeFile(planPath, JSON.stringify(plan), "utf8"),
      writeFile(manifestPath, JSON.stringify(manifest), "utf8"),
    ]);

    const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
    await assert.rejects(
      () => execFile(process.execPath, [
        cli,
        "scripts/agent-ablation-run.ts",
        "--plan", planPath,
        "--manifest", manifestPath,
        "--ledger", ledgerPath,
        "--raw-output-root", rawOutputRoot,
        "--max-cost-usd-per-run", "0.01",
        "--max-total-cost-usd", "1",
        "--max-estimated-input-tokens-per-call", "16000",
        "--max-output-tokens-per-call", "12000",
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          LONGCAT_API_KEY: undefined,
          LONGCAT_BASE_URL: undefined,
          LONGCAT_MODEL: undefined,
        },
      }),
      (error: unknown) => {
        const stderr = typeof error === "object" && error !== null && "stderr" in error
          ? String(error.stderr)
          : String(error);
        assert.match(stderr, /ABLATION_RUN_PER_RUN_BUDGET_TOO_LOW/);
        assert.doesNotMatch(stderr, /LONGCAT_ENV_MISSING/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ablation run preflight reports the frozen-plan protocol reserve instead of multiplying every run by the highest arm", async () => {
  const directory = await mkdtemp(path.resolve("local-only", "ablation-run-preflight-test-"));
  try {
    const manifest = createManifest();
    const plan = createAblationRunPlan(manifest, 1, 20260801);
    const planPath = path.join(directory, "run-plan.json");
    const manifestPath = path.join(directory, "manifest.json");
    const ledgerPath = path.join(directory, "result-ledger.json");
    const rawOutputRoot = path.join(directory, "raw");
    await Promise.all([
      writeFile(planPath, JSON.stringify(plan), "utf8"),
      writeFile(manifestPath, JSON.stringify(manifest), "utf8"),
    ]);

    const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const result = await execFile(process.execPath, [
      cli,
      "scripts/agent-ablation-run.ts",
      "--plan", planPath,
      "--manifest", manifestPath,
      "--ledger", ledgerPath,
      "--raw-output-root", rawOutputRoot,
      "--max-cost-usd-per-run", "1.2798",
      "--max-total-cost-usd", "92.1456",
    ], {
      cwd: process.cwd(),
      env: { ...process.env, LONGCAT_API_KEY: undefined, LONGCAT_BASE_URL: undefined, LONGCAT_MODEL: undefined },
    });
    assert.match(result.stdout, /"status": "preflight_only"/);
    assert.match(result.stdout, /"requiredProtocolReserveUsd": 58\.776/);
    assert.doesNotMatch(result.stdout, /maximumExternalCostUsd/);
    assert.match(result.stdout, /No model environment variables were read/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("authorization preflight validates the frozen study without loading Provider configuration", async () => {
  // 授权预检是负责人批准费用前的离线检查，子进程故意不提供任何 LongCat 环境变量。
  const directory = await mkdtemp(path.resolve("local-only", "ablation-authorization-preflight-test-"));
  try {
    const manifest = createManifest();
    const plan = createAblationRunPlan(manifest, 1, 20260801);
    const planPath = path.join(directory, "run-plan.json");
    const manifestPath = path.join(directory, "manifest.json");
    const ledgerPath = path.join(directory, "result-ledger.json");
    const rawOutputRoot = path.join(directory, "raw");
    const authorizationPath = path.join(directory, "execution-authorization.json");
    const authorization = {
      schemaVersion: 2,
      status: "approved",
      approvedBy: "test-owner",
      approvedAt: "2026-08-01T00:00:00+08:00",
      provider: "longcat-openai-compatible",
      model: "longcat-test",
      temperature: 0,
      plannerPromptVersion: "planner-v1",
      reviewPromptVersion: "review-v1",
      ragSnapshot: "rag-v1",
      caseManifestSha256: plan.caseManifestSha256,
      runPlanSha256: hashAblationJson(plan),
      maxEstimatedInputTokensPerCall: 16_000,
      maxOutputTokensPerCall: 12_000,
      pricingSnapshot: {
        sourceUrl: "https://longcat.chat/platform/docs/pricing/long-cat-2.0",
        retrievedAt: "2026-08-01T00:00:00+08:00",
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 2.95,
        inputTreatment: "uncached",
      },
      maxCostUsdPerRun: 1.3,
      maxTotalCostUsd: 93,
      rawOutputRoot,
      ledgerPath,
    };
    await Promise.all([
      writeFile(planPath, JSON.stringify(plan), "utf8"),
      writeFile(manifestPath, JSON.stringify(manifest), "utf8"),
      writeFile(authorizationPath, JSON.stringify(authorization), "utf8"),
    ]);

    const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const result = await execFile(process.execPath, [
      cli,
      "scripts/agent-ablation-authorization-preflight.ts",
      "--plan", planPath,
      "--manifest", manifestPath,
      "--authorization-file", authorizationPath,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LONGCAT_API_KEY: undefined,
        LONGCAT_BASE_URL: undefined,
        LONGCAT_MODEL: undefined,
      },
    });
    assert.match(result.stdout, /"status": "authorization_preflight_passed"/);
    assert.match(result.stdout, /No \.env file or Provider credential was read/);
    assert.doesNotMatch(result.stdout, /LONGCAT_ENV_MISSING/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("authorization preflight documents its no-cost input contract", async () => {
  const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const result = await execFile(process.execPath, [cli, "scripts/agent-ablation-authorization-preflight.ts", "--help"], {
    cwd: process.cwd(),
    env: { ...process.env, LONGCAT_API_KEY: undefined, LONGCAT_BASE_URL: undefined, LONGCAT_MODEL: undefined },
  });
  assert.match(result.stdout, /--authorization-file <local-only\/authorization\.json>/);
  assert.match(result.stdout, /does not load \.env, read Provider credentials, write a ledger, or call a model/);
});

test("authorization preflight rejects insufficient approved budget before Provider configuration", async () => {
  const directory = await mkdtemp(path.resolve("local-only", "ablation-authorization-budget-test-"));
  try {
    const manifest = createManifest();
    const plan = createAblationRunPlan(manifest, 1, 20260801);
    const planPath = path.join(directory, "run-plan.json");
    const manifestPath = path.join(directory, "manifest.json");
    const authorizationPath = path.join(directory, "execution-authorization.json");
    await Promise.all([
      writeFile(planPath, JSON.stringify(plan), "utf8"),
      writeFile(manifestPath, JSON.stringify(manifest), "utf8"),
      writeFile(authorizationPath, JSON.stringify({
        schemaVersion: 2, status: "approved", approvedBy: "test-owner", approvedAt: "2026-08-01T00:00:00+08:00",
        provider: "longcat-openai-compatible", model: "longcat-test", temperature: 0,
        plannerPromptVersion: "planner-v1", reviewPromptVersion: "review-v1", ragSnapshot: "rag-v1",
        caseManifestSha256: plan.caseManifestSha256, runPlanSha256: hashAblationJson(plan),
        maxEstimatedInputTokensPerCall: 16_000, maxOutputTokensPerCall: 12_000,
        pricingSnapshot: { sourceUrl: "https://longcat.chat/platform/docs/pricing/long-cat-2.0", retrievedAt: "2026-08-01T00:00:00+08:00", inputUsdPerMillion: 0.75, outputUsdPerMillion: 2.95, inputTreatment: "uncached" },
        // 单条额度满足最高成本臂（1.2798），只让总额门禁负责拒绝这份授权。
        maxCostUsdPerRun: 1.3, maxTotalCostUsd: 1,
        rawOutputRoot: path.join(directory, "raw"), ledgerPath: path.join(directory, "result-ledger.json"),
      }), "utf8"),
    ]);
    const cli = path.resolve("node_modules/tsx/dist/cli.mjs");
    await assert.rejects(
      () => execFile(process.execPath, [cli, "scripts/agent-ablation-authorization-preflight.ts", "--plan", planPath, "--manifest", manifestPath, "--authorization-file", authorizationPath], {
        cwd: process.cwd(),
        env: { ...process.env, LONGCAT_API_KEY: undefined, LONGCAT_BASE_URL: undefined, LONGCAT_MODEL: undefined },
      }),
      (error: unknown) => {
        const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : String(error);
        assert.match(stderr, /ABLATION_RUN_TOTAL_BUDGET_TOO_LOW/);
        assert.doesNotMatch(stderr, /LONGCAT_ENV_MISSING/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ablation plan CLI writes the frozen cost-bearing plan only under local-only", async () => {
  const directory = await mkdtemp(path.resolve("local-only", "ablation-plan-test-"));
  const publicOutputPath = path.resolve("ablation-plan-public-test.json");
  try {
    const manifest = createManifest();
    const manifestPath = path.join(directory, "manifest.json");
    const privateOutputPath = path.join(directory, "run-plan.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const cli = path.resolve("node_modules/tsx/dist/cli.mjs");

    const accepted = await execFile(process.execPath, [
      cli,
      "scripts/agent-ablation-plan.ts",
      "--manifest", manifestPath,
      "--trials", "1",
      "--output", privateOutputPath,
    ], { cwd: process.cwd() });
    assert.match(accepted.stderr, /"status": "frozen"/);

    await assert.rejects(
      () => execFile(process.execPath, [
        cli,
        "scripts/agent-ablation-plan.ts",
        "--manifest", manifestPath,
        "--trials", "1",
        "--output", publicOutputPath,
      ], { cwd: process.cwd() }),
      (error: unknown) => {
        const stderr = typeof error === "object" && error !== null && "stderr" in error
          ? String(error.stderr)
          : String(error);
        assert.match(stderr, /ABLATION_PLAN_OUTPUT_MUST_BE_LOCAL_ONLY/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(publicOutputPath, { force: true });
  }
});
