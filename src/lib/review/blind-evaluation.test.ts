import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { validateBlindCaseManifest } from "./blind-case-manifest";
import { createBlindRunPlan } from "./blind-run-plan";
import { analyzeBlindEvaluation, prepareBlindEvaluation, renderBlindEvaluationMarkdown } from "./blind-evaluation";
const narrative = "This report states a concrete scope, acceptance checks, dependencies, risks, and a staged implementation plan for independent review.";
const digest = "a".repeat(64);
const execFile = promisify(execFileCallback);

const manifest = validateBlindCaseManifest({
  schemaVersion: 1,
  protocolVersion: "p2-4-v1",
  frozenAt: "2026-07-19T12:00:00+08:00",
  cases: ["website", "admin", "learning"].flatMap((category, categoryIndex) =>
    Array.from({ length: 4 }, (_, index) => ({
      caseId: `case-${String(categoryIndex * 4 + index + 1).padStart(2, "0")}`,
      category,
      complexity: index % 2 === 0 ? "medium" : "high",
      requirement: `Build a traceable ${category} workflow with roles, recovery, auditability, measurable acceptance criteria, and implementation detail for blind evaluation case ${index}.`,
      acceptanceFocus: ["workflow", "security", "testing"],
    })),
  ),
});

function studyInput() {
  const plan = createBlindRunPlan(manifest);
  return {
    schemaVersion: 1 as const, studyId: "quality-pilot", protocolVersion: manifest.protocolVersion, minimumCaseCount: 12, minimumRaterCount: 2,
    metadata: {
      protocolFrozenAt: manifest.frozenAt, caseManifestSha256: plan.caseManifestSha256,
      model: { provider: "test", model: "test-model", promptVersion: "v1", parameters: { temperature: 0 } },
      knowledgeSnapshot: { sourceSetId: "knowledge-set", version: "1", sha256: digest },
      budget: { maxInputTokensPerRun: 1000, maxOutputTokensPerRun: 1000, maxCostUsdPerRun: 1 },
    },
    runs: plan.runs.map((run, index) => ({
      caseId: run.caseId, variant: run.variant, runId: run.runId, title: `Project brief ${index + 1}`,
      reportMarkdown: `${narrative} The priority index is ${index + 1}; the detail is intentionally neutral for blind review.`,
      latencyMs: 100 + index, inputTokens: 200 + (index % 5), outputTokens: 300 + (index % 5), costUsd: 0.01 + (index % 5) / 1000,
    })),
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
  const prepared = prepareBlindEvaluation(studyInput(), manifest, "fixed-seed");
  assert.equal(prepared.packet.entries.length, 60);
  assert.equal(prepared.reveal.entries.length, 60);
  assert.equal(prepared.leakageWarnings.length, 0);
  const packetText = JSON.stringify(prepared.packet);
  assert.doesNotMatch(packetText, /single_agent|case-01/);
  assert.match(packetText, /acceptanceFocus/);
  assert.equal(prepared.reveal.minimumCaseCount, 12);

  const ids = prepared.packet.entries.map((entry) => entry.blindId);
  const analysis = analyzeBlindEvaluation({
    reveal: prepared.reveal,
    scoreSheets: [scoreSheet("quality-pilot", prepared.packet.packetId, "rater-a", ids), scoreSheet("quality-pilot", prepared.packet.packetId, "rater-b", ids, 1)],
  });
  assert.equal(analysis.eligibleForClaim, true);
  assert.equal(analysis.caseCount, 12);
  assert.equal(analysis.raterCount, 2);
  assert.equal(analysis.variants.length, 5);
  assert.equal(analysis.variants[0].ratingCount, 24);
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
  assert.throws(() => prepareBlindEvaluation(leaky, manifest), /BLIND_IDENTITY_LEAK/);
  const acceptedLeak = prepareBlindEvaluation(leaky, manifest, "seed", true);
  assert.deepEqual(acceptedLeak.leakageWarnings.length, 1);
  const leakyAnalysis = analyzeBlindEvaluation({
    reveal: acceptedLeak.reveal,
    scoreSheets: [scoreSheet("quality-pilot", acceptedLeak.packet.packetId, "leak-rater-a", acceptedLeak.packet.entries.map((entry) => entry.blindId)), scoreSheet("quality-pilot", acceptedLeak.packet.packetId, "leak-rater-b", acceptedLeak.packet.entries.map((entry) => entry.blindId))],
  });
  assert.equal(leakyAnalysis.eligibleForClaim, false);
  assert.match(renderBlindEvaluationMarkdown(leakyAnalysis), /Identity-leakage deviations: B/);

  const overBudget = studyInput();
  overBudget.runs[0].costUsd = 2;
  assert.throws(() => prepareBlindEvaluation(overBudget, manifest), /BLIND_PREFLIGHT_BUDGET_EXCEEDED/);

  const loweredMinimum = { ...studyInput(), minimumCaseCount: 1 };
  assert.throws(() => prepareBlindEvaluation(loweredMinimum, manifest), /minimumCaseCount/);
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
    const manifestPath = join(directory, "manifest.json");
    await writeFile(inputPath, JSON.stringify(studyInput()), "utf8");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const cli = resolve("node_modules/tsx/dist/cli.mjs");
    const prepare = await execFile(process.execPath, [cli, "scripts/blind-evaluation.ts", "prepare", "--input", inputPath, "--packet", packetPath, "--reveal", revealPath, "--manifest", manifestPath], { cwd: process.cwd() });
    assert.match(prepare.stdout, /Prepared 60 anonymized entries/);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const ids = packet.entries.map((entry: { blindId: string }) => entry.blindId);
    await writeFile(scoreAPath, JSON.stringify(scoreSheet("quality-pilot", packet.packetId, "cli-rater-a", ids)), "utf8");
    await writeFile(scoreBPath, JSON.stringify(scoreSheet("quality-pilot", packet.packetId, "cli-rater-b", ids, 1)), "utf8");
    const analyze = await execFile(process.execPath, [cli, "scripts/blind-evaluation.ts", "analyze", "--reveal", revealPath, "--scores", `${scoreAPath},${scoreBPath}`, "--output", outputPath], { cwd: process.cwd() });
    assert.match(analyze.stdout, /Analyzed 12 cases and 2 raters: eligible/);
    assert.match(await readFile(outputPath, "utf8"), /Claim status: eligible/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
