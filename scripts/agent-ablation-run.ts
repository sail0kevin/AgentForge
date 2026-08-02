import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAblationArm } from "@/lib/review/agent-comparison";
import {
  assertAblationStudyMetadataMatches,
  hashAblationJson,
  validateAblationResultLedgerDraft,
  type AblationResultLedger,
  type AblationRunResult,
  type AblationStudyMetadata,
} from "@/lib/review/ablation-results";
import { validateAblationRunPlan } from "@/lib/review/ablation-protocol";
import { assertAblationBudgetCoversFrozenPlan, validateAblationExecutionAuthorization } from "@/lib/review/ablation-authorization";
import { isWithinLocalOnly } from "@/lib/review/ablation-authorization";
import { scoreChecklistAgainstText } from "@/lib/review/checklist-scoring";
import { validateLightweightCaseManifest } from "@/lib/review/lightweight-case-manifest";
import { createLongCatCallModel, readLongCatConfigFromEnv } from "@/lib/review/longcat-client";
import { ABLATION_LONGCAT_PRICING_SNAPSHOT, ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS, ABLATION_RUN_MAX_TOKENS } from "@/lib/review/ablation-budget";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredFlag(name: string) {
  const value = flagValue(name);
  if (!value) throw new Error(`ABLATION_RUN_FLAG_MISSING: ${name}`);
  return value;
}

function positiveNumber(name: string) {
  const value = Number(flagValue(name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`ABLATION_RUN_NUMBER_INVALID: ${name}`);
  return value;
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

/** 先写同目录临时文件再替换，避免进程中断留下半份 JSON 或原始输出。 */
async function writeAtomically(targetPath: string, content: string) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, targetPath);
}

async function readExistingLedger(ledgerPath: string, plan: ReturnType<typeof validateAblationRunPlan>) {
  try {
    return validateAblationResultLedgerDraft(JSON.parse(await readFile(ledgerPath, "utf8")), plan);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * 消融真实运行入口：默认只做 preflight，必须双显式确认才会读取模型环境变量并消耗预算。
 * 每个原始输出只写入 local-only，公开目录只应保存后续脱敏的聚合结果。
 */
async function main() {
  const planPath = requiredFlag("--plan");
  const manifestPath = requiredFlag("--manifest");
  const ledgerPath = requiredFlag("--ledger");
  const rawOutputRoot = requiredFlag("--raw-output-root");
  const execute = process.argv.includes("--execute");
  const confirmed = process.argv.includes("--confirm-external-costs");
  const maxCostUsdPerRun = positiveNumber("--max-cost-usd-per-run");
  const maxTotalCostUsd = positiveNumber("--max-total-cost-usd");
  const maxEstimatedInputTokensPerCall = Number(flagValue("--max-estimated-input-tokens-per-call") ?? ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS);
  const maxOutputTokensPerCall = Number(flagValue("--max-output-tokens-per-call") ?? ABLATION_RUN_MAX_TOKENS);
  if (!Number.isInteger(maxEstimatedInputTokensPerCall) || maxEstimatedInputTokensPerCall <= 0) throw new Error("ABLATION_RUN_NUMBER_INVALID: --max-estimated-input-tokens-per-call");
  if (!Number.isInteger(maxOutputTokensPerCall) || maxOutputTokensPerCall <= 0) throw new Error("ABLATION_RUN_NUMBER_INVALID: --max-output-tokens-per-call");
  const [rawPlan, rawManifest] = await Promise.all([
    readFile(path.resolve(planPath), "utf8"),
    readFile(path.resolve(manifestPath), "utf8"),
  ]);
  const plan = validateAblationRunPlan(JSON.parse(rawPlan));
  const manifest = validateLightweightCaseManifest(JSON.parse(rawManifest));
  if (plan.caseManifestSha256 !== sha256(JSON.stringify(manifest))) throw new Error("ABLATION_RUN_MANIFEST_MISMATCH");
  // 预检也必须拒绝无法覆盖冻结运行矩阵的预算，避免输出看似可执行的成功结果。
  const requiredProtocolReserveUsd = assertAblationBudgetCoversFrozenPlan({
    plan,
    maxCostUsdPerRun,
    maxTotalCostUsd,
    maxEstimatedInputTokensPerCall,
    maxOutputTokensPerCall,
  });
  if (!execute || !confirmed) {
    console.log(JSON.stringify({
      status: "preflight_only",
      plannedRunCount: plan.runs.length,
      // 总储备按冻结计划的实际四臂配比计算，不能把每次都误算为最高成本臂。
      requiredProtocolReserveUsd,
      declaredTotalBudgetUsd: maxTotalCostUsd,
      requiredFlags: ["--execute", "--confirm-external-costs", "--authorization-file"],
      limitation: "No model environment variables were read and no external model call was made. The declared ceilings must cover the frozen call topology under the supplied input/output token limits before execution.",
    }, null, 2));
    return;
  }
  const temperatureRaw = Number(flagValue("--temperature"));
  if (!Number.isFinite(temperatureRaw) || temperatureRaw < 0 || temperatureRaw > 2) throw new Error("ABLATION_RUN_TEMPERATURE_REQUIRED");
  const plannerPromptVersion = requiredFlag("--planner-prompt-version");
  const reviewPromptVersion = requiredFlag("--review-prompt-version");
  const ragSnapshot = requiredFlag("--rag-snapshot");
  const provider = requiredFlag("--provider");
  const declaredModel = requiredFlag("--model");
  const authorizationPath = requiredFlag("--authorization-file");

  // 在读取模型环境变量前先核验负责人授权，缺失或不一致时绝不触发外部调用。
  const resolvedRawRoot = path.resolve(rawOutputRoot);
  const resolvedLedgerPath = path.resolve(ledgerPath);
  const resolvedAuthorizationPath = path.resolve(authorizationPath);
  if (!isWithinLocalOnly(resolvedAuthorizationPath, process.cwd())) {
    throw new Error("ABLATION_AUTHORIZATION_PRIVATE_PATH_REQUIRED");
  }
  const rawAuthorizationContent = await readFile(resolvedAuthorizationPath, "utf8");
  await validateAblationExecutionAuthorization({
    rawAuthorization: JSON.parse(rawAuthorizationContent),
    configuration: {
      provider: provider as "longcat-openai-compatible",
      model: declaredModel,
      temperature: temperatureRaw,
      plannerPromptVersion,
      reviewPromptVersion,
      ragSnapshot,
      maxEstimatedInputTokensPerCall,
      maxOutputTokensPerCall,
      pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
      maxCostUsdPerRun,
      maxTotalCostUsd,
      rawOutputRoot: resolvedRawRoot,
      ledgerPath: resolvedLedgerPath,
    },
    plan,
    workspaceRoot: process.cwd(),
  });

  const config = readLongCatConfigFromEnv();
  if (provider !== "longcat-openai-compatible") throw new Error("ABLATION_RUN_PROVIDER_UNSUPPORTED");
  if (declaredModel !== config.model) throw new Error("ABLATION_RUN_MODEL_ENV_MISMATCH");
  const cases = new Map(manifest.cases.map((testCase) => [testCase.caseId, testCase]));
  const metadata: AblationStudyMetadata = {
    provider,
    model: declaredModel,
    temperature: temperatureRaw,
    plannerPromptVersion,
    reviewPromptVersion,
    ragSnapshot,
    caseManifestSha256: plan.caseManifestSha256,
    runPlanSha256: hashAblationJson(plan),
    maxEstimatedInputTokensPerCall,
    maxOutputTokensPerCall,
    pricingSnapshot: ABLATION_LONGCAT_PRICING_SNAPSHOT,
    maxCostUsdPerRun,
    maxTotalCostUsd,
    rawOutputRoot: resolvedRawRoot,
    ledgerPath: resolvedLedgerPath,
    authorizationPath: resolvedAuthorizationPath,
    authorizationSha256: sha256(rawAuthorizationContent),
  };
  await mkdir(resolvedRawRoot, { recursive: true });
  await mkdir(path.dirname(resolvedLedgerPath), { recursive: true });
  let ledger: AblationResultLedger = (await readExistingLedger(resolvedLedgerPath, plan)) ?? {
    schemaVersion: 1,
    protocolVersion: "ablation-v2",
    createdAt: new Date().toISOString(),
    metadata,
    results: [],
    inFlightRunId: null,
  };
  assertAblationStudyMetadataMatches(ledger.metadata, metadata);
  if (ledger.inFlightRunId) {
    throw new Error(`ABLATION_RUN_IN_FLIGHT_REQUIRES_RECONCILIATION: ${ledger.inFlightRunId}`);
  }
  let consumedCostUsd = ledger.results.reduce((total, result) => total + result.costUsd, 0);
  const settledRunIds = new Set(ledger.results.map((result) => result.runId));

  const persistLedger = async () => {
    ledger = validateAblationResultLedgerDraft(ledger, plan);
    await writeAtomically(resolvedLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  };

  for (const run of plan.runs) {
    if (settledRunIds.has(run.runId)) continue;
    const testCase = cases.get(run.caseId);
    if (!testCase) throw new Error("ABLATION_RUN_CASE_MISSING");
    const started = new Date();
    const remainingBudget = Number((maxTotalCostUsd - consumedCostUsd).toFixed(8));
    const runBudget = Math.min(maxCostUsdPerRun, remainingBudget);
    if (runBudget <= 0) throw new Error("ABLATION_RUN_TOTAL_BUDGET_EXHAUSTED");
    const model = createLongCatCallModel({ config, temperature: temperatureRaw, maxTotalCostUsd: runBudget, maxTokens: maxOutputTokensPerCall, maxEstimatedInputTokens: maxEstimatedInputTokensPerCall, timeoutMs: 180_000 });
    // 先记录未结算调用；异常退出后必须人工核对 Provider 账单，绝不自动重复发起请求。
    ledger.inFlightRunId = run.runId;
    await persistLedger();
    let result: AblationRunResult;
    try {
      const output = await runAblationArm({ variant: run.variant, requirement: testCase.requirement, callModel: model.callModel });
      consumedCostUsd = Number((consumedCostUsd + model.usage.costUsd).toFixed(8));
      const finished = new Date();
      if (!output.solutionText?.trim()) {
        result = {
          ...run, status: "excluded", startedAt: started.toISOString(), finishedAt: finished.toISOString(), durationMs: finished.getTime() - started.getTime(),
          coverageRate: null, constraintSatisfactionRate: null, outputSha256: null, rawOutputPath: null,
          errorCode: output.status === "needs_clarification" ? "NEEDS_CLARIFICATION" : "EMPTY_SOLUTION",
          inputTokens: model.usage.inputTokens, outputTokens: model.usage.outputTokens, costUsd: model.usage.costUsd, callCount: model.usage.callCount,
        };
      } else {
        const rawOutputPath = path.join(resolvedRawRoot, `${run.runId}.txt`);
        // 原始文件与 ledger 使用同一字节内容计算哈希，报告审计无需猜测换行规则。
        await writeAtomically(rawOutputPath, output.solutionText);
        const score = scoreChecklistAgainstText(testCase, output.solutionText);
        result = {
        ...run, status: "completed", startedAt: started.toISOString(), finishedAt: finished.toISOString(), durationMs: finished.getTime() - started.getTime(),
        coverageRate: score.coverageRate, constraintSatisfactionRate: score.constraintSatisfactionRate,
        outputSha256: sha256(output.solutionText), rawOutputPath, errorCode: null,
        inputTokens: model.usage.inputTokens, outputTokens: model.usage.outputTokens, costUsd: model.usage.costUsd, callCount: model.usage.callCount,
        };
      }
    } catch (error) {
      consumedCostUsd = Number((consumedCostUsd + model.usage.costUsd).toFixed(8));
      const finished = new Date();
      result = {
        ...run, status: "excluded", startedAt: started.toISOString(), finishedAt: finished.toISOString(), durationMs: finished.getTime() - started.getTime(),
        coverageRate: null, constraintSatisfactionRate: null, outputSha256: null, rawOutputPath: null,
        errorCode: error instanceof Error ? error.message.split(":")[0].slice(0, 120) || "ABLATION_RUN_FAILED" : "ABLATION_RUN_FAILED",
        inputTokens: model.usage.inputTokens, outputTokens: model.usage.outputTokens, costUsd: model.usage.costUsd, callCount: model.usage.callCount,
      };
    }
    ledger.results.push(result);
    ledger.inFlightRunId = null;
    settledRunIds.add(run.runId);
    await persistLedger();
  }

  console.error(`Wrote ${ledger.results.length} audited results to ${resolvedLedgerPath}; total external cost USD=${consumedCostUsd}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
