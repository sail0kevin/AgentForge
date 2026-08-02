import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isWithinLocalOnly, validateAblationExecutionAuthorization } from "@/lib/review/ablation-authorization";
import { pairedBootstrapDelta } from "@/lib/review/ablation-statistics";
import { verifyAblationRawOutputs } from "@/lib/review/ablation-audit";
import { summarizeAblationAvailability, toPairedMetricObservations, validateAblationResultLedger } from "@/lib/review/ablation-results";
import { validateAblationRunPlan } from "@/lib/review/ablation-protocol";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

/** 报告前重验负责人的原始授权，避免台账在执行后与授权文件脱钩。 */
async function verifyExecutionAuthorization(ledger: ReturnType<typeof validateAblationResultLedger>, plan: ReturnType<typeof validateAblationRunPlan>) {
  const authorizationPath = path.resolve(ledger.metadata.authorizationPath);
  if (!isWithinLocalOnly(authorizationPath, process.cwd())) throw new Error("ABLATION_AUTHORIZATION_PRIVATE_PATH_REQUIRED");
  const rawAuthorizationContent = await readFile(authorizationPath, "utf8");
  if (sha256(rawAuthorizationContent) !== ledger.metadata.authorizationSha256) {
    throw new Error("ABLATION_AUTHORIZATION_HASH_MISMATCH");
  }
  validateAblationExecutionAuthorization({
    rawAuthorization: JSON.parse(rawAuthorizationContent),
    configuration: {
      provider: "longcat-openai-compatible",
      model: ledger.metadata.model,
      temperature: ledger.metadata.temperature,
      plannerPromptVersion: ledger.metadata.plannerPromptVersion,
      reviewPromptVersion: ledger.metadata.reviewPromptVersion,
      ragSnapshot: ledger.metadata.ragSnapshot,
      maxEstimatedInputTokensPerCall: ledger.metadata.maxEstimatedInputTokensPerCall,
      maxOutputTokensPerCall: ledger.metadata.maxOutputTokensPerCall,
      pricingSnapshot: ledger.metadata.pricingSnapshot,
      maxCostUsdPerRun: ledger.metadata.maxCostUsdPerRun,
      maxTotalCostUsd: ledger.metadata.maxTotalCostUsd,
      rawOutputRoot: ledger.metadata.rawOutputRoot,
      ledgerPath: ledger.metadata.ledgerPath,
    },
    plan,
    workspaceRoot: process.cwd(),
  });
}

/**
 * 只读取已经写入私有目录的实验台账，不发起模型调用。
 * 输出强调配对数和排除数，避免把失败运行伪装成零质量或无声忽略。
 */
async function main() {
  const planPath = flagValue("--plan");
  const ledgerPath = flagValue("--ledger");
  if (!planPath || !ledgerPath) {
    throw new Error("ABLATION_REPORT_INPUT_MISSING: provide --plan <run-plan.json> --ledger <result-ledger.json>");
  }

  const plan = validateAblationRunPlan(await readJson(planPath));
  const ledger = validateAblationResultLedger(await readJson(ledgerPath), plan);
  await verifyExecutionAuthorization(ledger, plan);
  const rawOutputAudit = await verifyAblationRawOutputs(ledger);
  const coverage = toPairedMetricObservations(ledger, "coverageRate");
  const constraints = toPairedMetricObservations(ledger, "constraintSatisfactionRate");
  const comparisons = [
    "dual_candidate_no_review",
    "single_candidate_with_review",
    "full_multi_agent",
  ].map((treatmentVariant) => ({
    treatmentVariant,
    coverageRate: pairedBootstrapDelta({ observations: coverage, baselineVariant: "single_agent", treatmentVariant }),
    constraintSatisfactionRate: pairedBootstrapDelta({ observations: constraints, baselineVariant: "single_agent", treatmentVariant }),
  }));

  console.log(JSON.stringify({
    status: "measured_from_ledger",
    protocolVersion: ledger.protocolVersion,
    metadata: ledger.metadata,
    plannedRunCount: plan.runs.length,
    availability: summarizeAblationAvailability(ledger),
    rawOutputAudit,
    comparisons,
    limitation: "This report only summarizes a validated frozen run ledger. Checklist metrics indicate keyword coverage, not technical correctness or human judgement. Excluded runs are reported as excluded pairs and are never converted to zero scores.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
