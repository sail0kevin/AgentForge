import { createHash } from "node:crypto";
import { z } from "zod";
import type { BlindCaseManifest } from "./blind-case-manifest";
import { BlindEvaluationVariantSchema, type BlindEvaluationVariant } from "./blind-evaluation-variants";
import { createBlindRunPlan } from "./blind-run-plan";

export const BLIND_EVALUATION_MINIMUM_CASE_COUNT = 12 as const;
export const BLIND_EVALUATION_MINIMUM_RATER_COUNT = 2 as const;
export { BlindEvaluationVariantSchema, type BlindEvaluationVariant } from "./blind-evaluation-variants";

export const BlindEvaluationRunSchema = z.object({
  caseId: z.string().min(1),
  variant: BlindEvaluationVariantSchema,
  runId: z.string().min(1),
  title: z.string().min(1),
  reportMarkdown: z.string().min(80),
  latencyMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});

const PrimitiveParameterSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 digest");

/** Records the conditions which must be frozen before generating any report. */
export const BlindEvaluationStudyMetadataSchema = z.object({
  protocolFrozenAt: z.string().datetime({ offset: true }),
  caseManifestSha256: Sha256Schema,
  model: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    parameters: z.record(z.string(), PrimitiveParameterSchema),
  }),
  knowledgeSnapshot: z.object({
    sourceSetId: z.string().min(1),
    version: z.string().min(1),
    sha256: Sha256Schema,
  }).nullable(),
  budget: z.object({
    maxInputTokensPerRun: z.number().int().positive(),
    maxOutputTokensPerRun: z.number().int().positive(),
    maxCostUsdPerRun: z.number().positive(),
  }),
});

export const BlindEvaluationInputSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1),
  protocolVersion: z.string().min(1),
  // 最低样本量属于冻结协议，禁止由每次实验输入降低。
  minimumCaseCount: z.literal(BLIND_EVALUATION_MINIMUM_CASE_COUNT),
  minimumRaterCount: z.literal(BLIND_EVALUATION_MINIMUM_RATER_COUNT),
  metadata: BlindEvaluationStudyMetadataSchema,
  runs: z.array(BlindEvaluationRunSchema).min(5),
});

export const BlindScoreSchema = z.object({
  blindId: z.string().min(1),
  requirementCoverage: z.number().int().min(1).max(5),
  technicalFeasibility: z.number().int().min(1).max(5),
  testability: z.number().int().min(1).max(5),
  evidenceCorrectness: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  humanRevisionMinutes: z.number().nonnegative(),
  comments: z.string().max(4000).default(""),
});

export const BlindScoreSheetSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1),
  packetId: Sha256Schema,
  raterId: z.string().min(1),
  scores: z.array(BlindScoreSchema).min(1),
});

export type BlindEvaluationInput = z.infer<typeof BlindEvaluationInputSchema>;
export type BlindScoreSheet = z.infer<typeof BlindScoreSheetSchema>;

const RevealEntrySchema = BlindEvaluationRunSchema.extend({ blindId: z.string().regex(/^B\d{3,}$/), packetCase: z.number().int().positive() });
type RevealEntry = z.infer<typeof RevealEntrySchema>;

export const BlindEvaluationPacketSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1),
  protocolVersion: z.string().min(1),
  packetId: Sha256Schema,
  entries: z.array(z.object({
    blindId: z.string().regex(/^B\d{3,}$/),
    packetCase: z.number().int().positive(),
    title: z.string().min(1),
    // 评分者必须看到同一份冻结需求和验收重点，才可评价“需求覆盖度”。
    requirement: z.string().min(60),
    acceptanceFocus: z.array(z.string().min(2)).min(3),
    reportMarkdown: z.string().min(80),
  })).min(1),
});
export type BlindEvaluationPacket = z.infer<typeof BlindEvaluationPacketSchema>;

export const BlindEvaluationRevealSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1),
  protocolVersion: z.string().min(1),
  packetId: Sha256Schema,
  minimumCaseCount: z.number().int().positive(),
  minimumRaterCount: z.number().int().positive(),
  metadata: BlindEvaluationStudyMetadataSchema,
  // 允许继续完成工具链演练，但该偏差必须在解盲汇总中永久可见。
  identityLeakageWarnings: z.array(z.string().regex(/^B\d{3,}$/)),
  entries: z.array(RevealEntrySchema).min(5),
});
export type BlindEvaluationReveal = z.infer<typeof BlindEvaluationRevealSchema>;

const variants = BlindEvaluationVariantSchema.options;
const metrics = ["requirementCoverage", "technicalFeasibility", "testability", "evidenceCorrectness", "clarity"] as const;

function problem(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function deterministicRank(value: string, seed: string) {
  let hash = 2166136261;
  for (const char of `${seed}:${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateRuns(input: BlindEvaluationInput) {
  const ids = new Set<string>();
  const grouped = new Map<string, BlindEvaluationVariant[]>();
  for (const run of input.runs) {
    if (ids.has(run.runId)) problem("BLIND_RUN_DUPLICATE", `runId ${run.runId} is duplicated`);
    ids.add(run.runId);
    grouped.set(run.caseId, [...(grouped.get(run.caseId) ?? []), run.variant]);
  }
  for (const [caseId, caseVariants] of grouped) {
    if (caseVariants.length !== variants.length || new Set(caseVariants).size !== variants.length || !variants.every((variant) => caseVariants.includes(variant))) {
      problem("BLIND_VARIANT_SET_INVALID", `case ${caseId} must contain each of the five variants exactly once`);
    }
  }
  if (input.runs.some((run) => run.variant === "dual_candidate_rag" || run.variant === "cross_review" || run.variant === "cross_review_human") && !input.metadata.knowledgeSnapshot) {
    problem("BLIND_KNOWLEDGE_SNAPSHOT_REQUIRED", "RAG or cross-review variants require a frozen knowledgeSnapshot");
  }
}

/**
 * 匿名化前在本模块内重复执行冻结计划校验，避免与独立 preflight 命令形成循环导入。
 * 两个入口的错误码保持一致，分别服务自动化阻断与人工预检。
 */
function validateInputAgainstFrozenPlan(raw: unknown, manifest: BlindCaseManifest) {
  const input = BlindEvaluationInputSchema.parse(raw);
  const plan = createBlindRunPlan(manifest);
  if (input.protocolVersion !== manifest.protocolVersion) {
    problem("BLIND_PREFLIGHT_PROTOCOL", "input and manifest protocol versions differ");
  }
  if (input.metadata.caseManifestSha256 !== plan.caseManifestSha256) {
    problem("BLIND_PREFLIGHT_MANIFEST_HASH", "input does not reference the frozen case manifest");
  }
  if (input.metadata.protocolFrozenAt !== manifest.frozenAt) {
    problem("BLIND_PREFLIGHT_FROZEN_AT", "input protocolFrozenAt must equal the frozen case manifest time");
  }
  if (input.runs.length !== plan.runs.length) {
    problem("BLIND_PREFLIGHT_RUN_COUNT", `expected ${plan.runs.length} runs, received ${input.runs.length}`);
  }
  const expected = new Map(plan.runs.map((run) => [run.runId, run]));
  for (const run of input.runs) {
    const planned = expected.get(run.runId);
    if (!planned || planned.caseId !== run.caseId || planned.variant !== run.variant) {
      problem("BLIND_PREFLIGHT_RUN_MISMATCH", `${run.runId} is not the registered case/variant run`);
    }
    if (run.inputTokens > input.metadata.budget.maxInputTokensPerRun || run.outputTokens > input.metadata.budget.maxOutputTokensPerRun || run.costUsd > input.metadata.budget.maxCostUsdPerRun) {
      problem("BLIND_PREFLIGHT_BUDGET_EXCEEDED", `${run.runId} exceeds a frozen per-run budget`);
    }
  }
  return input;
}

function potentiallyLeaksIdentity(text: string, caseId: string) {
  return variants.some((variant) => text.toLowerCase().includes(variant)) || text.toLowerCase().includes(caseId.toLowerCase());
}

/**
 * 将 preflight 与匿名化绑定为同一入口，避免两个命令之间替换输入文件。
 * 传入的 manifest 也为评分包提供不含 caseId 的需求与验收上下文。
 */
export function prepareBlindEvaluation(raw: unknown, manifest: BlindCaseManifest, seed = "agentforge-blind-v1", allowIdentityLeakage = false) {
  const input = validateInputAgainstFrozenPlan(raw, manifest);
  validateRuns(input);
  const cases = new Map(manifest.cases.map((item) => [item.caseId, item]));
  const ordered = [...input.runs].sort((left, right) => deterministicRank(left.runId, seed) - deterministicRank(right.runId, seed));
  const revealEntries: RevealEntry[] = ordered.map((run, index) => ({ ...run, blindId: `B${String(index + 1).padStart(3, "0")}`, packetCase: index + 1 }));
  const leakageWarnings = revealEntries.filter((entry) => potentiallyLeaksIdentity(`${entry.title}\n${entry.reportMarkdown}`, entry.caseId)).map((entry) => entry.blindId);
  if (leakageWarnings.length > 0 && !allowIdentityLeakage) {
    problem("BLIND_IDENTITY_LEAK", `packet entries may reveal a case or variant: ${leakageWarnings.join(", ")}. Remove the text or explicitly allow the protocol deviation.`);
  }
  const packetEntries = revealEntries.map(({ blindId, packetCase, reportMarkdown, caseId }) => {
    const testCase = cases.get(caseId);
    if (!testCase) problem("BLIND_PACKET_CASE_UNKNOWN", `case ${caseId} is absent from the frozen manifest`);
    return {
      blindId,
      packetCase,
      title: `Anonymous report ${blindId}`,
      requirement: testCase.requirement,
      acceptanceFocus: testCase.acceptanceFocus,
      reportMarkdown,
    };
  });
  const packetId = createHash("sha256").update(JSON.stringify({ studyId: input.studyId, protocolVersion: input.protocolVersion, entries: packetEntries })).digest("hex");
  return {
    packet: { schemaVersion: 1 as const, studyId: input.studyId, protocolVersion: input.protocolVersion, packetId, entries: packetEntries },
    reveal: { schemaVersion: 1 as const, studyId: input.studyId, protocolVersion: input.protocolVersion, packetId, minimumCaseCount: input.minimumCaseCount, minimumRaterCount: input.minimumRaterCount, metadata: input.metadata, identityLeakageWarnings: leakageWarnings, entries: revealEntries },
    leakageWarnings,
  };
}

function mean(numbers: number[]) {
  return numbers.length === 0 ? 0 : Number((numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(3));
}

export function analyzeBlindEvaluation(raw: { reveal: BlindEvaluationReveal; scoreSheets: unknown[] }) {
  const reveal = BlindEvaluationRevealSchema.parse(raw.reveal);
  validateRuns({ schemaVersion: 1, studyId: reveal.studyId, protocolVersion: reveal.protocolVersion, minimumCaseCount: BLIND_EVALUATION_MINIMUM_CASE_COUNT, minimumRaterCount: BLIND_EVALUATION_MINIMUM_RATER_COUNT, metadata: reveal.metadata, runs: reveal.entries.map((entry) => ({
    caseId: entry.caseId, variant: entry.variant, runId: entry.runId, title: entry.title, reportMarkdown: entry.reportMarkdown,
    latencyMs: entry.latencyMs, inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, costUsd: entry.costUsd,
  })) });
  const scoreSheets = raw.scoreSheets.map((sheet) => BlindScoreSheetSchema.parse(sheet));
  const blindIds = new Set(reveal.entries.map((entry) => entry.blindId));
  if (blindIds.size !== reveal.entries.length) problem("BLIND_ID_DUPLICATE", "reveal contains duplicate blind IDs");
  const raterIds = new Set<string>();
  for (const sheet of scoreSheets) {
    if (sheet.studyId !== reveal.studyId) problem("BLIND_STUDY_MISMATCH", `rater ${sheet.raterId} belongs to another study`);
    if (sheet.packetId !== reveal.packetId) problem("BLIND_PACKET_MISMATCH", `rater ${sheet.raterId} scored another packet`);
    if (raterIds.has(sheet.raterId)) problem("BLIND_RATER_DUPLICATE", `rater ${sheet.raterId} appears more than once`);
    raterIds.add(sheet.raterId);
    const seen = new Set(sheet.scores.map((score) => score.blindId));
    if (seen.size !== sheet.scores.length || seen.size !== blindIds.size || [...blindIds].some((id) => !seen.has(id))) {
      problem("BLIND_SCORE_INCOMPLETE", `rater ${sheet.raterId} must score every packet entry exactly once`);
    }
  }
  const byBlindId = new Map<string, z.infer<typeof BlindScoreSchema>[]>();
  for (const sheet of scoreSheets) for (const score of sheet.scores) byBlindId.set(score.blindId, [...(byBlindId.get(score.blindId) ?? []), score]);
  const variantsSummary = variants.map((variant) => {
    const entries = reveal.entries.filter((entry) => entry.variant === variant);
    const scores = entries.flatMap((entry) => byBlindId.get(entry.blindId) ?? []);
    const ratings = Object.fromEntries(metrics.map((metric) => [metric, mean(scores.map((score) => score[metric]))])) as Record<(typeof metrics)[number], number>;
    return {
      variant, caseCount: entries.length, ratingCount: scores.length, ratings,
      humanRevisionMinutes: mean(scores.map((score) => score.humanRevisionMinutes)),
      latencyMs: mean(entries.map((entry) => entry.latencyMs)), inputTokens: mean(entries.map((entry) => entry.inputTokens)),
      outputTokens: mean(entries.map((entry) => entry.outputTokens)), costUsd: mean(entries.map((entry) => entry.costUsd)),
    };
  });
  const baseline = variantsSummary.find((item) => item.variant === "single_agent")!;
  const caseCount = new Set(reveal.entries.map((entry) => entry.caseId)).size;
  const eligibleForClaim = caseCount >= reveal.minimumCaseCount && scoreSheets.length >= reveal.minimumRaterCount && reveal.identityLeakageWarnings.length === 0;
  return {
    studyId: reveal.studyId, caseCount, raterCount: scoreSheets.length, variants: variantsSummary.map((item) => ({
      ...item,
      deltaVsSingleAgent: {
        ...Object.fromEntries(metrics.map((metric) => [metric, Number((item.ratings[metric] - baseline.ratings[metric]).toFixed(3))])),
        humanRevisionMinutes: Number((item.humanRevisionMinutes - baseline.humanRevisionMinutes).toFixed(3)),
      },
    })),
    protocolDeviations: { identityLeakageWarnings: reveal.identityLeakageWarnings },
    eligibleForClaim,
    claimBoundary: eligibleForClaim ? "Scores are eligible for a descriptive blind-comparison claim; report raw data, protocol deviations, and uncertainty." : "Toolchain output only: do not claim a quality advantage until the preregistered case/rater thresholds are met and the anonymous packet has no accepted identity-leakage deviation.",
  };
}

export function renderBlindEvaluationMarkdown(analysis: ReturnType<typeof analyzeBlindEvaluation>) {
  const rows = analysis.variants.map((item) => `| ${item.variant} | ${item.caseCount} | ${item.ratingCount} | ${item.ratings.requirementCoverage} | ${item.ratings.technicalFeasibility} | ${item.ratings.testability} | ${item.ratings.evidenceCorrectness} | ${item.humanRevisionMinutes} | ${item.latencyMs} | ${item.inputTokens} | ${item.outputTokens} | ${item.costUsd} |`).join("\n");
  const leakage = analysis.protocolDeviations.identityLeakageWarnings.length === 0
    ? "none"
    : analysis.protocolDeviations.identityLeakageWarnings.join(", ");
  return `# ${analysis.studyId} blind-evaluation summary\n\n- Cases: ${analysis.caseCount}\n- Independent raters: ${analysis.raterCount}\n- Identity-leakage deviations: ${leakage}\n- Claim status: ${analysis.eligibleForClaim ? "eligible" : "not eligible"}\n\n${analysis.claimBoundary}\n\n| Variant | Cases | Ratings | Coverage | Feasibility | Testability | Evidence | Revision min | Latency ms | Input tokens | Output tokens | Cost USD |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n`;
}
