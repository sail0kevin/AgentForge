import { z } from "zod";
import { ABLATION_VARIANTS, type AblationVariant } from "./agent-comparison";
import { hashLightweightCaseManifest, type LightweightCaseManifest } from "./lightweight-case-manifest";

const AblationVariantSchema = z.enum(ABLATION_VARIANTS);

export const AblationRunPlanEntrySchema = z.object({
  caseId: z.string().min(1),
  trial: z.number().int().positive(),
  variant: AblationVariantSchema,
  runId: z.string().min(1),
  status: z.literal("pending"),
});

export const AblationRunPlanSchema = z.object({
  schemaVersion: z.literal(2),
  protocolVersion: z.literal("ablation-v2"),
  manifestProtocolVersion: z.string().min(1),
  caseManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  trialCount: z.number().int().positive().max(100),
  executionOrderSeed: z.number().int().nonnegative(),
  variants: z.tuple([AblationVariantSchema, AblationVariantSchema, AblationVariantSchema, AblationVariantSchema]),
  runs: z.array(AblationRunPlanEntrySchema).min(4),
});

export type AblationRunPlan = z.infer<typeof AblationRunPlanSchema>;

export type AblationRunPlanEntry = z.infer<typeof AblationRunPlanEntrySchema>;

function runId(caseId: string, trial: number, variant: AblationVariant) {
  return `${caseId}-trial-${trial}-${variant}`;
}

/**
 * 用冻结种子为每个 case/trial 配对块生成确定性伪随机序列。
 * 每个块仍包含同一组四臂，只有真实调用顺序变化，以降低 Provider 随时间波动造成的系统性偏差。
 */
function createBlockRandom(seed: number, caseId: string, trial: number) {
  let state = (seed ^ trial) >>> 0;
  for (const character of caseId) state = Math.imul(state ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function shuffledVariants(seed: number, caseId: string, trial: number) {
  const variants = [...ABLATION_VARIANTS];
  const random = createBlockRandom(seed, caseId, trial);
  for (let index = variants.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [variants[index], variants[target]] = [variants[target]!, variants[index]!];
  }
  return variants;
}

/** 冻结运行矩阵；每个 case/trial 必须完整覆盖四个实验臂，不能在执行后补臂。 */
export function createAblationRunPlan(manifest: LightweightCaseManifest, trialCount: number, executionOrderSeed = 2_026_0801): AblationRunPlan {
  const runs = Array.from({ length: trialCount }, (_, trialIndex) => manifest.cases.flatMap((testCase) =>
    shuffledVariants(executionOrderSeed, testCase.caseId, trialIndex + 1).map((variant) => ({
      caseId: testCase.caseId,
      trial: trialIndex + 1,
      variant,
      runId: runId(testCase.caseId, trialIndex + 1, variant),
      status: "pending" as const,
    })),
  )).flat();
  return validateAblationRunPlan({
    schemaVersion: 2,
    protocolVersion: "ablation-v2",
    manifestProtocolVersion: manifest.protocolVersion,
    caseManifestSha256: hashLightweightCaseManifest(manifest),
    trialCount,
    executionOrderSeed,
    variants: ABLATION_VARIANTS,
    runs,
  });
}

export function validateAblationRunPlan(raw: unknown): AblationRunPlan {
  const plan = AblationRunPlanSchema.parse(raw);
  const ids = new Set(plan.runs.map((run) => run.runId));
  if (ids.size !== plan.runs.length) throw new Error("ABLATION_RUN_ID_DUPLICATE");
  const expectedCount = plan.runs.length / ABLATION_VARIANTS.length;
  const groups = new Map<string, AblationVariant[]>();
  for (const run of plan.runs) {
    const key = `${run.caseId}:${run.trial}`;
    groups.set(key, [...(groups.get(key) ?? []), run.variant]);
  }
  if (groups.size !== expectedCount) throw new Error("ABLATION_RUN_MATRIX_INVALID");
  for (const variants of groups.values()) {
    if (variants.length !== ABLATION_VARIANTS.length || !ABLATION_VARIANTS.every((variant) => variants.includes(variant))) {
      throw new Error("ABLATION_VARIANT_SET_INVALID");
    }
  }
  return plan;
}
