import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeBlindEvaluation, prepareBlindEvaluation, renderBlindEvaluationMarkdown, type BlindEvaluationVariant } from "./blind-evaluation";

const variants: BlindEvaluationVariant[] = ["single_agent", "dual_candidate", "dual_candidate_rag", "cross_review", "cross_review_human"];
const narrative = "This report states a concrete scope, acceptance checks, dependencies, risks, and a staged implementation plan for independent review.";
const digest = "a".repeat(64);
const execFile = promisify(execFileCallback);

function studyInput() {
  return {
    schemaVersion: 1 as const, studyId: "quality-pilot", protocolVersion: "2026-07-15", minimumCaseCount: 2, minimumRaterCount: 2,
    metadata: {
      protocolFrozenAt: "2026-07-15T14:00:00.000Z", caseManifestSha256: digest,
      model: { provider: "test", model: "test-model", promptVersion: "v1", parameters: { temperature: 0 } },
      knowledgeSnapshot: { sourceSetId: "knowledge-set", version: "1", sha256: digest },
      budget: { maxInputTokensPerRun: 1000, maxOutputTokensPerRun: 1000, maxCostUsdPerRun: 1 },
    },
    runs: ["public-site", "admin-portal"].flatMap((caseId, caseIndex) => variants.map((variant, variantIndex) => ({
      caseId, variant, runId: `${caseId}-${variant}`, title: `Project brief ${caseIndex + 1}`,
      reportMarkdown: `${narrative} The priority index is ${variantIndex + 1}; the detail is intentionally neutral for blind review.`,
      latencyMs: 100 + variantIndex, inputTokens: 200 + variantIndex, outputTokens: 300 + variantIndex, costUsd: 0.01 + variantIndex / 1000,
    }))),
  };
}

function scoreSheet(studyId: string, packetId: string, raterId: string, blindIds: string[], bonus = 0) {
  return {
    schemaVersion: 1 as const, studyId, packetId, raterId,
    scores: blindIds.map((blindId, index) => ({
      blindId, requirementCoverage: 3 + ((index + bonus) % 2), technicalFeasibility: 4, testability: 4,
      evidenceCorrectness: 3, clarity: 4, humanRevisionMinutes: 10 + bonus, comments: "Checked independently.",
    })),
  };
}

test("blind evaluation separates packets, validates complete scores, and aggregates only after reveal", () => {
  const prepared = prepareBlindEvaluation(studyInput(), "fixed-seed");
  assert.equal(prepared.packet.entries.length, 10);
  assert.equal(prepared.reveal.entries.length, 10);
  assert.equal(prepared.leakageWarnings.length, 0);
  const packetText = JSON.stringify(prepared.packet);
  assert.doesNotMatch(packetText, /single_agent|public-site|admin-portal/);
  assert.equal(prepared.reveal.minimumCaseCount, 2);

  const ids = prepared.packet.entries.map((entry) => entry.blindId);
  const analysis = analyzeBlindEvaluation({
    reveal: prepared.reveal,
    scoreSheets: [scoreSheet("quality-pilot", prepared.packet.packetId, "rater-a", ids), scoreSheet("quality-pilot", prepared.packet.packetId, "rater-b", ids, 1)],
  });
  assert.equal(analysis.eligibleForClaim, true);
  assert.equal(analysis.caseCount, 2);
  assert.equal(analysis.raterCount, 2);
  assert.equal(analysis.variants.length, 5);
  assert.equal(analysis.variants[0].ratingCount, 4);
  const markdown = renderBlindEvaluationMarkdown(analysis);
  assert.match(markdown, /Claim status: eligible/);
  assert.match(markdown, /Input tokens/);

  assert.throws(() => analyzeBlindEvaluation({
    reveal: prepared.reveal,
    scoreSheets: [scoreSheet("quality-pilot", prepared.packet.packetId, "incomplete", ids.slice(1)), scoreSheet("quality-pilot", prepared.packet.packetId, "rater-b", ids)],
  }), /BLIND_SCORE_INCOMPLETE/);

  assert.throws(() => analyzeBlindEvaluation({
    reveal: prepared.reveal,
    scoreSheets: [scoreSheet("quality-pilot", "b".repeat(64), "wrong-packet", ids), scoreSheet("quality-pilot", prepared.packet.packetId, "rater-b", ids)],
  }), /BLIND_PACKET_MISMATCH/);

  const leaky = studyInput();
  leaky.runs[0].reportMarkdown = `${narrative} This is a single_agent report.`;
  assert.throws(() => prepareBlindEvaluation(leaky), /BLIND_IDENTITY_LEAK/);
  assert.deepEqual(prepareBlindEvaluation(leaky, "seed", true).leakageWarnings.length, 1);
});

test("blind-evaluation CLI creates a packet and only analyzes score sheets bound to it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agentforge-blind-"));
  try {
    const inputPath = join(directory, "input.json");
    const packetPath = join(directory, "packet.json");
    const revealPath = join(directory, "reveal.json");
    const scoreAPath = join(directory, "score-a.json");
    const scoreBPath = join(directory, "score-b.json");
    const outputPath = join(directory, "result.md");
    await writeFile(inputPath, JSON.stringify(studyInput()), "utf8");
    const cli = resolve("node_modules/tsx/dist/cli.mjs");
    const prepare = await execFile(process.execPath, [cli, "scripts/blind-evaluation.ts", "prepare", "--input", inputPath, "--packet", packetPath, "--reveal", revealPath], { cwd: process.cwd() });
    assert.match(prepare.stdout, /Prepared 10 anonymized entries/);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const ids = packet.entries.map((entry: { blindId: string }) => entry.blindId);
    await writeFile(scoreAPath, JSON.stringify(scoreSheet("quality-pilot", packet.packetId, "cli-rater-a", ids)), "utf8");
    await writeFile(scoreBPath, JSON.stringify(scoreSheet("quality-pilot", packet.packetId, "cli-rater-b", ids, 1)), "utf8");
    const analyze = await execFile(process.execPath, [cli, "scripts/blind-evaluation.ts", "analyze", "--reveal", revealPath, "--scores", `${scoreAPath},${scoreBPath}`, "--output", outputPath], { cwd: process.cwd() });
    assert.match(analyze.stdout, /Analyzed 2 cases and 2 raters: eligible/);
    assert.match(await readFile(outputPath, "utf8"), /Claim status: eligible/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
