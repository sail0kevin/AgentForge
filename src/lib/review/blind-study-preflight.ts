import type { BlindCaseManifest } from "./blind-case-manifest";
import { BlindEvaluationInputSchema } from "./blind-evaluation";
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
  if (input.runs.length !== plan.runs.length) {
    throw new Error(`BLIND_PREFLIGHT_RUN_COUNT: expected ${plan.runs.length} runs, received ${input.runs.length}`);
  }
  const expected = new Map(plan.runs.map((run) => [run.runId, run]));
  for (const run of input.runs) {
    const planned = expected.get(run.runId);
    if (!planned || planned.caseId !== run.caseId || planned.variant !== run.variant) {
      throw new Error(`BLIND_PREFLIGHT_RUN_MISMATCH: ${run.runId} is not the registered case/variant run`);
    }
  }
  return input;
}
