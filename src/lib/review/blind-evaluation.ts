import { createHash } from "node:crypto";
import { z } from "zod";

export const BlindEvaluationVariantSchema = z.enum([
  "single_agent",
  "dual_candidate",
  "dual_candidate_rag",
  "cross_review",
  "cross_review_human",
]);

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
  minimumCaseCount: z.number().int().positive().default(12),
  minimumRaterCount: z.number().int().positive().default(2),
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
export type BlindEvaluationVariant = z.infer<typeof BlindEvaluationVariantSchema>;
export type BlindScoreSheet = z.infer<typeof BlindScoreSheetSchema>;

const RevealEntrySchema = BlindEvaluationRunSchema.extend({ blindId: z.string().regex(/^B\d{3,}$/), packetCase: z.number().int().positive() });
type RevealEntry = z.infer<typeof RevealEntrySchema>;

export type BlindEvaluationPacket = {
  schemaVersion: 1;
  studyId: string;
  protocolVersion: string;
  packetId: string;
  entries: Array<{ blindId: string; packetCase: number; title: string; reportMarkdown: string }>;
};

export const BlindEvaluationRevealSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.string().min(1),
  protocolVersion: z.string().min(1),
  packetId: Sha256Schema,
  minimumCaseCount: z.number().int().positive(),
  minimumRaterCount: z.number().int().positive(),
  metadata: BlindEvaluationStudyMetadataSchema,
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

function potentiallyLeaksIdentity(text: string, caseId: string) {
  return variants.some((variant) => text.toLowerCase().includes(variant)) || text.toLowerCase().includes(caseId.toLowerCase());
}

/** Separates anonymous rating material from the private variant/runtime reveal file. */
export function prepareBlindEvaluation(raw: unknown, seed = "agentforge-blind-v1", allowIdentityLeakage = false) {
  const input = BlindEvaluationInputSchema.parse(raw);
  validateRuns(input);
  const ordered = [...input.runs].sort((left, right) => deterministicRank(left.runId, seed) - deterministicRank(right.runId, seed));
  const revealEntries: RevealEntry[] = ordered.map((run, index) => ({ ...run, blindId: `B${String(index + 1).padStart(3, "0")}`, packetCase: index + 1 }));
  const leakageWarnings = revealEntries.filter((entry) => potentiallyLeaksIdentity(`${entry.title}\n${entry.reportMarkdown}`, entry.caseId)).map((entry) => entry.blindId);
  if (leakageWarnings.length > 0 && !allowIdentityLeakage) {
    problem("BLIND_IDENTITY_LEAK", `packet entries may reveal a case or variant: ${leakageWarnings.join(", ")}. Remove the text or explicitly allow the protocol deviation.`);
  }
  const packetId = createHash("sha256").update(JSON.stringify({ studyId: input.studyId, protocolVersion: input.protocolVersion, entries: revealEntries.map(({ blindId, packetCase, reportMarkdown }) => ({ blindId, packetCase, reportMarkdown })) })).digest("hex");
  return {
    packet: { schemaVersion: 1 as const, studyId: input.studyId, protocolVersion: input.protocolVersion, packetId, entries: revealEntries.map(({ blindId, packetCase, reportMarkdown }) => ({ blindId, packetCase, title: `Anonymous report ${blindId}`, reportMarkdown })) },
    reveal: { schemaVersion: 1 as const, studyId: input.studyId, protocolVersion: input.protocolVersion, packetId, minimumCaseCount: input.minimumCaseCount, minimumRaterCount: input.minimumRaterCount, metadata: input.metadata, entries: revealEntries },
    leakageWarnings,
  };
}

function mean(numbers: number[]) {
  return numbers.length === 0 ? 0 : Number((numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(3));
}

export function analyzeBlindEvaluation(raw: { reveal: BlindEvaluationReveal; scoreSheets: unknown[] }) {
  const reveal = BlindEvaluationRevealSchema.parse(raw.reveal);
  validateRuns({ schemaVersion: 1, studyId: reveal.studyId, protocolVersion: reveal.protocolVersion, minimumCaseCount: reveal.minimumCaseCount, minimumRaterCount: reveal.minimumRaterCount, metadata: reveal.metadata, runs: reveal.entries.map((entry) => ({
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
  const eligibleForClaim = caseCount >= reveal.minimumCaseCount && scoreSheets.length >= reveal.minimumRaterCount;
  return {
    studyId: reveal.studyId, caseCount, raterCount: scoreSheets.length, variants: variantsSummary.map((item) => ({
      ...item,
      deltaVsSingleAgent: {
        ...Object.fromEntries(metrics.map((metric) => [metric, Number((item.ratings[metric] - baseline.ratings[metric]).toFixed(3))])),
        humanRevisionMinutes: Number((item.humanRevisionMinutes - baseline.humanRevisionMinutes).toFixed(3)),
      },
    })),
    eligibleForClaim,
    claimBoundary: eligibleForClaim ? "Scores are eligible for a descriptive blind-comparison claim; report raw data, protocol deviations, and uncertainty." : "Toolchain output only: do not claim a quality advantage until the preregistered case and independent-rater thresholds are met.",
  };
}

export function renderBlindEvaluationMarkdown(analysis: ReturnType<typeof analyzeBlindEvaluation>) {
  const rows = analysis.variants.map((item) => `| ${item.variant} | ${item.caseCount} | ${item.ratingCount} | ${item.ratings.requirementCoverage} | ${item.ratings.technicalFeasibility} | ${item.ratings.testability} | ${item.ratings.evidenceCorrectness} | ${item.humanRevisionMinutes} | ${item.latencyMs} | ${item.inputTokens} | ${item.outputTokens} | ${item.costUsd} |`).join("\n");
  return `# ${analysis.studyId} blind-evaluation summary\n\n- Cases: ${analysis.caseCount}\n- Independent raters: ${analysis.raterCount}\n- Claim status: ${analysis.eligibleForClaim ? "eligible" : "not eligible"}\n\n${analysis.claimBoundary}\n\n| Variant | Cases | Ratings | Coverage | Feasibility | Testability | Evidence | Revision min | Latency ms | Input tokens | Output tokens | Cost USD |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n`;
}
