import { z } from "zod";
import type { BlindCaseManifest } from "./blind-case-manifest";
import { hashBlindCaseManifest } from "./blind-case-manifest";
import { BlindEvaluationVariantSchema } from "./blind-evaluation";

const BlindRunPlanEntrySchema = z.object({
  caseId: z.string().regex(/^case-\d{2}$/),
  variant: BlindEvaluationVariantSchema,
  runId: z.string().regex(/^case-\d{2}-(single-agent|dual-candidate|dual-candidate-rag|cross-review|cross-review-human)$/),
  requirement: z.string().min(60),
  status: z.literal("pending"),
});

export const BlindRunPlanSchema = z.object({
  schemaVersion: z.literal(1),
  protocolVersion: z.string().min(1),
  caseManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  runs: z.array(BlindRunPlanEntrySchema).length(60),
});

export type BlindRunPlan = z.infer<typeof BlindRunPlanSchema>;

function runId(caseId: string, variant: z.infer<typeof BlindEvaluationVariantSchema>) {
  return `${caseId}-${variant.replaceAll("_", "-")}`;
}

export function createBlindRunPlan(manifest: BlindCaseManifest): BlindRunPlan {
  const runs = manifest.cases.flatMap((testCase) => BlindEvaluationVariantSchema.options.map((variant) => ({
    caseId: testCase.caseId,
    variant,
    runId: runId(testCase.caseId, variant),
    requirement: testCase.requirement,
    status: "pending" as const,
  })));
  return validateBlindRunPlan({
    schemaVersion: 1,
    protocolVersion: manifest.protocolVersion,
    caseManifestSha256: hashBlindCaseManifest(manifest),
    runs,
  });
}

export function validateBlindRunPlan(raw: unknown) {
  const plan = BlindRunPlanSchema.parse(raw);
  const runIds = new Set(plan.runs.map((run) => run.runId));
  if (runIds.size !== plan.runs.length) throw new Error("BLIND_RUN_PLAN_DUPLICATE: runId must be unique");
  for (const caseId of new Set(plan.runs.map((run) => run.caseId))) {
    const variants = plan.runs.filter((run) => run.caseId === caseId).map((run) => run.variant);
    if (variants.length !== BlindEvaluationVariantSchema.options.length || !BlindEvaluationVariantSchema.options.every((variant) => variants.includes(variant))) {
      throw new Error(`BLIND_RUN_PLAN_VARIANTS: ${caseId} must contain all five variants exactly once`);
    }
  }
  return plan;
}
