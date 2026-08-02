import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertAblationBudgetCoversFrozenPlan,
  isWithinLocalOnly,
  validateAblationExecutionAuthorization,
} from "@/lib/review/ablation-authorization";
import { validateAblationRunPlan } from "@/lib/review/ablation-protocol";
import { hashLightweightCaseManifest, validateLightweightCaseManifest } from "@/lib/review/lightweight-case-manifest";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredFlag(name: string) {
  const value = flagValue(name);
  if (!value) throw new Error(`ABLATION_AUTHORIZATION_PREFLIGHT_FLAG_MISSING: ${name}`);
  return value;
}

function printUsage() {
  console.log([
    "Usage: npm run quality:ablation:authorization-preflight -- --plan <run-plan.json> --manifest <manifest.json> --authorization-file <local-only/authorization.json>",
    "",
    "Reads only frozen experiment inputs and the approval record. It does not load .env, read Provider credentials, write a ledger, or call a model.",
  ].join("\n"));
}

/**
 * 该入口只读取冻结计划、案例清单和授权记录，不加载 .env、不写入台账、更不会调用 Provider。
 * 负责人可在批准外部费用前确认授权文件与实际实验输入完全一致。
 */
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  const planPath = path.resolve(requiredFlag("--plan"));
  const manifestPath = path.resolve(requiredFlag("--manifest"));
  const authorizationPath = path.resolve(requiredFlag("--authorization-file"));
  if (!isWithinLocalOnly(authorizationPath, process.cwd())) {
    throw new Error("ABLATION_AUTHORIZATION_PRIVATE_PATH_REQUIRED");
  }

  const [rawPlan, rawManifest, rawAuthorization] = await Promise.all([
    readFile(planPath, "utf8"),
    readFile(manifestPath, "utf8"),
    readFile(authorizationPath, "utf8"),
  ]);
  const plan = validateAblationRunPlan(JSON.parse(rawPlan));
  const manifest = validateLightweightCaseManifest(JSON.parse(rawManifest));
  // 清单哈希由协议层生成；重新创建同一冻结计划时必须与读入清单相同。
  const expectedManifestHash = hashLightweightCaseManifest(manifest);
  if (plan.caseManifestSha256 !== expectedManifestHash) throw new Error("ABLATION_RUN_MANIFEST_MISMATCH");

  const authorization = validateAblationExecutionAuthorization({
    rawAuthorization: JSON.parse(rawAuthorization),
    configuration: JSON.parse(rawAuthorization),
    plan,
    workspaceRoot: process.cwd(),
  });
  const minimumTotalCostUsd = assertAblationBudgetCoversFrozenPlan({
    plan,
    maxCostUsdPerRun: authorization.maxCostUsdPerRun,
    maxTotalCostUsd: authorization.maxTotalCostUsd,
    maxEstimatedInputTokensPerCall: authorization.maxEstimatedInputTokensPerCall,
    maxOutputTokensPerCall: authorization.maxOutputTokensPerCall,
  });

  console.log(JSON.stringify({
    status: "authorization_preflight_passed",
    plannedRunCount: plan.runs.length,
    caseManifestSha256: plan.caseManifestSha256,
    runPlanSha256: authorization.runPlanSha256,
    declaredCostCeilingsUsd: {
      perRun: authorization.maxCostUsdPerRun,
      total: authorization.maxTotalCostUsd,
      minimumRequiredTotal: minimumTotalCostUsd,
    },
    tokenLimitsPerCall: {
      estimatedInput: authorization.maxEstimatedInputTokensPerCall,
      output: authorization.maxOutputTokensPerCall,
    },
    limitation: "No .env file or Provider credential was read, no ledger was written, and no external model call was made.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
