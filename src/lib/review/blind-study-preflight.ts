import type { BlindCaseManifest } from "./blind-case-manifest";
import { BLIND_EVALUATION_MINIMUM_CASE_COUNT, BLIND_EVALUATION_MINIMUM_RATER_COUNT, BlindEvaluationInputSchema } from "./blind-evaluation";
import { createBlindRunPlan } from "./blind-run-plan";

export function validateBlindStudyAgainstPlan(rawInput: unknown, manifest: BlindCaseManifest) {
  const input = BlindEvaluationInputSchema.parse(rawInput);
  const plan = createBlindRunPlan(manifest);
  if (input.protocolVersion !== manifest.protocolVersion) {
    throw new Error("BLIND_PREFLIGHT_PROTOCOL: input and manifest protocol versions differ");
  }
  if (input.metadata.caseManifestSha256 !== plan.caseManifestSha256) {
    throw new Error("BLIND_PREFLIGHT_MANIFEST_HASH: input does not reference the frozen case manifest");
  }
  if (input.metadata.protocolFrozenAt !== manifest.frozenAt) {
    throw new Error("BLIND_PREFLIGHT_FROZEN_AT: input protocolFrozenAt must equal the frozen case manifest time");
  }
  if (input.minimumCaseCount !== BLIND_EVALUATION_MINIMUM_CASE_COUNT || input.minimumRaterCount !== BLIND_EVALUATION_MINIMUM_RATER_COUNT) {
    throw new Error("BLIND_PREFLIGHT_MINIMUMS: input cannot lower the preregistered case or rater minimum");
  }
  if (input.runs.length !== plan.runs.length) {
    throw new Error(`BLIND_PREFLIGHT_RUN_COUNT: expected ${plan.runs.length} runs, received ${input.runs.length}`);
  }
  const expected = new Map(plan.runs.map((run) => [run.runId, run]));
  for (const run of input.runs) {
    const planned = expected.get(run.runId);
    if (!planned || planned.caseId !== run.caseId || planned.variant !== run.variant) {
      throw new Error(`BLIND_PREFLIGHT_RUN_MISMATCH: ${run.runId} is not the registered case/variant run`);
    }
    if (run.inputTokens > input.metadata.budget.maxInputTokensPerRun || run.outputTokens > input.metadata.budget.maxOutputTokensPerRun || run.costUsd > input.metadata.budget.maxCostUsdPerRun) {
      throw new Error(`BLIND_PREFLIGHT_BUDGET_EXCEEDED: ${run.runId} exceeds a frozen per-run budget`);
    }
  }
  return input;
}
