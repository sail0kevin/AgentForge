import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "@/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { runReviewWorkflow } from "@/lib/review/review-service";
import { createProductUIReportGroup } from "./product-ui-report";
import type { ReportGenerationInput } from "./report-service";
import { exportProductUIImplementationExperimentPackage } from "../../../scripts/product-ui-implementation-experiment-package";
import { runProductUIImplementationPreflight } from "../../../scripts/product-ui-implementation-preflight";

async function fixture(requirement: string): Promise<ReportGenerationInput> {
  const analysis = analyzeRequirementBaseline(requirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const result = await runReviewWorkflow({ analysis, plan, budget: ReviewBudgetSchema.parse({}) });
  return {
    planningArtifactId: `plan-${analysis.projectType}`,
    requirement,
    analysis,
    plan,
    reviewWorkflow: {
      id: `review-${analysis.projectType}`,
      status: "approved",
      candidates: result.candidates,
      review: result.review,
      evaluation: { ...result.evaluation, decision: "approved", unresolvedConflicts: [] },
      failures: [],
      approval: {
        status: "approved",
        decision: "hybrid",
        note: "Keep hard safety gates and stage the rest.",
        decidedAt: "2026-08-05T00:00:00.000Z",
        taskPatch: null,
        originalPlanSha256: null,
        amendedPlanSha256: null,
      },
    },
    knowledgeEvidence: [],
  };
}

async function createPreflightFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "agentforge-preflight-"));
  const packageDir = path.join(root, "package");
  const seedDir = path.join(root, "seed");
  await mkdir(seedDir, { recursive: true });

  const group = createProductUIReportGroup(await fixture(
    "Build a cultural exhibition website with a responsive gallery, accessible navigation, artist stories and a clear visit-planning flow.",
  ), { groupId: "preflight-group" });
  const report = group.reports[0]!;
  const downstreamModel = {
    provider: "test",
    adapterVersion: "test-adapter-v1",
    model: "test-model",
    promptVersion: "preflight-prompt-v1",
    parameters: { temperature: 0 },
  };
  await exportProductUIImplementationExperimentPackage({
    studyId: "preflight-study",
    caseId: "preflight-case",
    reportGroup: group,
    solutionId: report.productUISpec!.solutionId,
    downstreamModel,
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "preflight-rubric-v1",
    generatedAt: "2026-08-05T00:00:00.000Z",
  }, packageDir);

  const generatorConfig = {
    seedDir: "seed",
    claudeCommand: "claude",
    execution: downstreamModel,
    permissionMode: "acceptEdits",
    allowedTools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
  };
  await writeFile(path.join(root, "generator.json"), `${JSON.stringify(generatorConfig, null, 2)}\n`, "utf8");
  const config = {
    packageDir: "package",
    outputDir: "runs",
    run: {
      runId: "preflight-run-001",
      variant: "agentforge_manifest",
      sourceRevision: null,
    },
    generator: {
      command: "tsx",
      args: ["scripts/product-ui-implementation-claude-generator.ts", "--config", "generator.json"],
      cwd: ".",
      timeoutMs: 900000,
    },
    preview: {
      command: "node",
      args: ["server.mjs"],
      cwd: ".",
      timeoutMs: 120000,
      previewUrl: "http://127.0.0.1:4173",
      readyTimeoutMs: 60000,
      pollIntervalMs: 500,
    },
    evaluator: {
      headless: true,
      navigationTimeoutMs: 30000,
      settleMs: 250,
      desktopViewport: { width: 1440, height: 1000 },
      mobileViewport: { width: 390, height: 844 },
    },
  };
  await writeFile(path.join(root, "orchestrator.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { root, packageDir, configPath: path.join(root, "orchestrator.json"), config, generatorConfigPath: path.join(root, "generator.json") };
}

test("preflight accepts a frozen experiment package when command probes are skipped", async (t) => {
  const fixtureData = await createPreflightFixture();
  t.after(() => rm(fixtureData.root, { recursive: true, force: true }));

  const result = await runProductUIImplementationPreflight(fixtureData.config, {
    packageDir: "package",
    configPath: "orchestrator.json",
    cwd: fixtureData.root,
    probeCommands: false,
    }, {
      now: () => new Date("2026-08-05T00:00:00.000Z"),
    });

  assert.equal(result.ready, true, JSON.stringify(result, null, 2));
  assert.equal(result.blockingReasons.length, 0);
  assert.equal(result.checkedAt, "2026-08-05T00:00:00.000Z");
  assert.equal(result.checks.some((check) => check.id === "package.agentforge_manifest.binding" && check.status === "pass"), true);
  assert.equal(result.checks.some((check) => check.status === "warning"), true);
});

test("preflight blocks a frozen prompt hash mismatch", async (t) => {
  const fixtureData = await createPreflightFixture();
  t.after(() => rm(fixtureData.root, { recursive: true, force: true }));
  const promptPath = path.join(fixtureData.packageDir, "operator", "agentforge-manifest-prompt.md");
  await writeFile(promptPath, `${await readFile(promptPath, "utf8")}tampered\n`, "utf8");

  const result = await runProductUIImplementationPreflight(fixtureData.config, {
    packageDir: "package",
    configPath: "orchestrator.json",
    cwd: fixtureData.root,
    probeCommands: false,
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockingReasons.includes("agentforge_prompt_hash mismatch"));
  assert.equal(result.checks.find((check) => check.id === "package.agentforge_prompt_hash")?.status, "fail");
});

test("preflight blocks generator metadata drift from case.json", async (t) => {
  const fixtureData = await createPreflightFixture();
  t.after(() => rm(fixtureData.root, { recursive: true, force: true }));
  const generatorConfig = JSON.parse(await readFile(fixtureData.generatorConfigPath, "utf8")) as { execution: { model: string } };
  generatorConfig.execution.model = "different-model";
  await writeFile(fixtureData.generatorConfigPath, `${JSON.stringify(generatorConfig, null, 2)}\n`, "utf8");

  const result = await runProductUIImplementationPreflight(fixtureData.config, {
    packageDir: "package",
    configPath: "orchestrator.json",
    cwd: fixtureData.root,
    probeCommands: false,
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockingReasons.includes("generator.execution.model mismatch"));
  assert.equal(result.checks.find((check) => check.id === "generator.execution.model")?.status, "fail");
});

test("preflight blocks reuse of an existing run output directory", async (t) => {
  const fixtureData = await createPreflightFixture();
  t.after(() => rm(fixtureData.root, { recursive: true, force: true }));
  await mkdir(path.join(fixtureData.root, "runs", fixtureData.config.run.runId), { recursive: true });

  const result = await runProductUIImplementationPreflight(fixtureData.config, {
    packageDir: "package",
    configPath: "orchestrator.json",
    cwd: fixtureData.root,
    probeCommands: false,
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockingReasons.includes("run output directory already exists"));
  assert.equal(result.checks.find((check) => check.id === "output.run-directory")?.status, "fail");
});
