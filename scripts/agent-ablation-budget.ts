import { readFile } from "node:fs/promises";
import path from "node:path";
import { LONGCAT_STANDARD_PRICING } from "@/lib/billing";
import { ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS, ABLATION_RUN_MAX_TOKENS, estimateAblationBudget } from "@/lib/review/ablation-budget";
import { validateAblationRunPlan } from "@/lib/review/ablation-protocol";
import { hashAblationJson } from "@/lib/review/ablation-results";
import { hashLightweightCaseManifest, validateLightweightCaseManifest } from "@/lib/review/lightweight-case-manifest";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredFlag(name: string) {
  const value = flagValue(name);
  if (!value) throw new Error(`ABLATION_BUDGET_FLAG_MISSING: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: string) {
  const value = Number(flagValue(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`ABLATION_BUDGET_NUMBER_INVALID: ${name}`);
  return value;
}

/**
 * 该估算使用冻结的每调用输入/输出限制计算最坏情形储备，不把它当作真实 Provider 账单。
 * 后续节点的实际输入会随模型输出变化，运行后的 ledger 和 Provider 账单才是实际消耗证据。
 */
async function main() {
  const plan = validateAblationRunPlan(JSON.parse(await readFile(path.resolve(requiredFlag("--plan")), "utf8")));
  const manifest = validateLightweightCaseManifest(JSON.parse(await readFile(path.resolve(requiredFlag("--manifest")), "utf8")));
  if (plan.caseManifestSha256 !== hashLightweightCaseManifest(manifest)) throw new Error("ABLATION_BUDGET_MANIFEST_MISMATCH");
  const maxEstimatedInputTokensPerCall = positiveInteger("--max-estimated-input-tokens-per-call", String(ABLATION_RUN_MAX_ESTIMATED_INPUT_TOKENS));
  const maxOutputTokensPerCall = positiveInteger("--max-output-tokens-per-call", String(ABLATION_RUN_MAX_TOKENS));
  const model = flagValue("--model") ?? LONGCAT_STANDARD_PRICING.model;
  if (model !== LONGCAT_STANDARD_PRICING.model) throw new Error("ABLATION_BUDGET_MODEL_UNSUPPORTED: only the priced LongCat-2.0 protocol is supported");
  const budget = estimateAblationBudget({ plan, maxEstimatedInputTokens: maxEstimatedInputTokensPerCall, maxOutputTokens: maxOutputTokensPerCall });

  console.log(JSON.stringify({
    status: "budget_estimate_only",
    plannedRunCount: plan.runs.length,
    runPlanSha256: hashAblationJson(plan),
    model,
    tokenLimitsPerCall: { estimatedInput: maxEstimatedInputTokensPerCall, output: maxOutputTokensPerCall },
    pricing: {
      model: LONGCAT_STANDARD_PRICING.model,
      inputUsdPerMillion: LONGCAT_STANDARD_PRICING.inputUsdPerMillion,
      outputUsdPerMillion: LONGCAT_STANDARD_PRICING.outputUsdPerMillion,
      sourceUrl: LONGCAT_STANDARD_PRICING.sourceUrl,
      retrievedAt: LONGCAT_STANDARD_PRICING.retrievedAt,
      inputTreatment: "uncached",
    },
    arms: budget.arms,
    minimumPerRunReserveUsd: budget.minimumPerRunUsd,
    minimumTotalReserveUsd: budget.minimumTotalUsd,
    limitation: "This is a protocol reserve, not actual spend or a Provider-billed hard ceiling. Output is request-limited; input is a local estimate used to cap prompt growth and must be reconciled from Provider-reported usage, the ledger, and the Provider bill.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
