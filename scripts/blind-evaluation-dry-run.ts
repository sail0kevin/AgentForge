import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateBlindCaseManifest } from "../src/lib/review/blind-case-manifest";
import { analyzeBlindEvaluation, prepareBlindEvaluation } from "../src/lib/review/blind-evaluation";
import { createBlindRunPlan } from "../src/lib/review/blind-run-plan";
import { validateBlindStudyAgainstPlan } from "../src/lib/review/blind-study-preflight";

async function main() {
  const manifestPath = path.resolve("docs/quality - 质量评测/case-manifest.json");
  const manifest = validateBlindCaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const plan = createBlindRunPlan(manifest);
  const rawInput = {
    schemaVersion: 1,
    studyId: "synthetic-pipeline-dry-run",
    protocolVersion: manifest.protocolVersion,
    minimumCaseCount: 12,
    minimumRaterCount: 2,
    metadata: {
      protocolFrozenAt: manifest.frozenAt,
      caseManifestSha256: plan.caseManifestSha256,
      model: { provider: "synthetic", model: "no-model-called", promptVersion: "dry-run-v1", parameters: { temperature: 0 } },
      knowledgeSnapshot: { sourceSetId: "synthetic", version: "dry-run-v1", sha256: "c".repeat(64) },
      budget: { maxInputTokensPerRun: 1000, maxOutputTokensPerRun: 1000, maxCostUsdPerRun: 1 },
    },
    runs: plan.runs.map((run, index) => ({
      caseId: run.caseId,
      variant: run.variant,
      runId: run.runId,
      title: "Anonymous synthetic development report",
      reportMarkdown: `Synthetic pipeline validation report ${index + 1}. It contains requirements, architecture, risks, evidence, testing, recovery, and delivery steps. No model quality is represented.`,
      latencyMs: 100 + index,
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0,
    })),
  };

  const input = validateBlindStudyAgainstPlan(rawInput, manifest);
  const prepared = prepareBlindEvaluation(input, "synthetic-dry-run-seed");
  const scoreSheets = ["synthetic-rater-a", "synthetic-rater-b"].map((raterId, raterIndex) => ({
    schemaVersion: 1 as const,
    studyId: prepared.packet.studyId,
    packetId: prepared.packet.packetId,
    raterId,
    scores: prepared.packet.entries.map((entry) => ({
      blindId: entry.blindId,
      requirementCoverage: 3,
      technicalFeasibility: 3,
      testability: 3,
      evidenceCorrectness: 3,
      clarity: 3,
      humanRevisionMinutes: 10 + raterIndex,
      comments: "Synthetic score used only to validate the pipeline.",
    })),
  }));
  const analysis = analyzeBlindEvaluation({ reveal: prepared.reveal, scoreSheets });
  if (!analysis.eligibleForClaim || analysis.caseCount !== 12 || analysis.raterCount !== 2) {
    throw new Error("Synthetic blind-evaluation dry run did not satisfy the registered pipeline thresholds");
  }

  console.log(JSON.stringify({
    synthetic: true,
    modelCalled: false,
    caseCount: analysis.caseCount,
    variantCount: analysis.variants.length,
    runCount: prepared.packet.entries.length,
    raterCount: analysis.raterCount,
    packetId: prepared.packet.packetId,
    pipelineEligible: analysis.eligibleForClaim,
    conclusion: "Toolchain validation only; no model quality claim is permitted.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
