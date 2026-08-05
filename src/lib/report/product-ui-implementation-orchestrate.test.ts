import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildProductUIImplementationBranchEnvironment,
  orchestrateProductUIImplementation,
  runProductUIImplementationProcess,
  type ProductUIProcessResult,
} from "../../../scripts/product-ui-implementation-orchestrate";
import { stableJsonSha256 } from "../../../src/lib/report/product-ui-implementation-evaluation";

function evaluationCase() {
  return {
    schemaVersion: 1 as const,
    studyId: "orchestrator-study",
    caseId: "attendance-orchestrator",
    requirement: "Create an attendance workbench that is usable and reviewable in a browser.",
    reportGroupId: "attendance-reports",
    solutionId: "attendance-ui",
    routes: ["/generated/attendance"],
    expectedAcceptanceIds: ["route.attendance"],
    acceptanceProbes: [{
      acceptanceId: "route.attendance",
      kind: "route" as const,
      route: "/generated/attendance",
    }],
    downstreamModel: {
      provider: "test",
      adapterVersion: "test-adapter-v1",
      model: "fixed-model",
      promptVersion: "orchestrator-v1",
      parameters: { temperature: 0 },
    },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "orchestrator-rubric-v1",
    claimBoundary: "This case verifies a registered browser path and cannot prove visual quality.",
    variants: [
      {
        variant: "baseline_direct_prompt" as const,
        promptSha256: "a".repeat(64),
        reportSha256: null,
        manifestSha256: null,
      },
      {
        variant: "agentforge_manifest" as const,
        promptSha256: "b".repeat(64),
        reportSha256: "c".repeat(64),
        manifestSha256: "d".repeat(64),
      },
    ],
  };
}

function processResult(status: ProductUIProcessResult["exitStatus"], stdoutPath: string, stderrPath: string): ProductUIProcessResult {
  return {
    startedAt: "2026-08-04T00:00:00.000Z",
    completedAt: "2026-08-04T00:00:01.000Z",
    exitStatus: status,
    exitCode: status === "completed" ? 0 : 1,
    signal: null,
    stdoutPath,
    stderrPath,
    error: status === "completed" ? null : "simulated failure",
  };
}

// 构造真实协议可接受的摘要，确保编排器测试覆盖摘要校验后的路径。
async function writeValidGeneratorSummary(input: {
  outputDir: string;
  runId: string;
  variant: "baseline_direct_prompt" | "agentforge_manifest";
}) {
  const testCase = evaluationCase();
  const branch = testCase.variants.find((item) => item.variant === input.variant);
  assert.ok(branch);
  await writeFile(path.join(input.outputDir, "claude-generator-summary.json"), `${JSON.stringify({
    schemaVersion: 1,
    type: "agentforge_product_ui_claude_generator",
    runId: input.runId,
    caseId: testCase.caseId,
    variant: input.variant,
    projectDir: path.join(input.outputDir, "generated-project"),
    frozenPromptPath: path.join(input.outputDir, "execution-input", "frozen-prompt.md"),
    frozenPromptSha256: branch.promptSha256,
    expectedPromptSha256: branch.promptSha256,
    claudeCommand: { command: "test-generator", args: [] },
    execution: {
      provider: testCase.downstreamModel.provider,
      model: testCase.downstreamModel.model,
      promptVersion: testCase.downstreamModel.promptVersion,
      parametersSha256: stableJsonSha256(testCase.downstreamModel.parameters),
      adapterVersion: testCase.downstreamModel.adapterVersion,
    },
    permissionMode: "acceptEdits",
    allowedTools: ["Read"],
    seed: {
      sourceDir: path.join(input.outputDir, "seed"),
      sha256: "e".repeat(64),
      fileCount: 1,
    },
    startedAt: "2026-08-04T00:00:00.000Z",
    completedAt: "2026-08-04T00:00:01.000Z",
    exitCode: 0,
    signal: null,
    responsePath: path.join(input.outputDir, "generator-response.json"),
    stderrPath: path.join(input.outputDir, "generator.stderr.log"),
    failure: null,
  }, null, 2)}\n`, "utf8");
}

async function createPackage() {
  const root = await mkdtemp(path.join(tmpdir(), "agentforge-orchestrator-"));
  const packageDir = path.join(root, "package");
  await mkdir(path.join(packageDir, "operator"), { recursive: true });
  await writeFile(path.join(packageDir, "case.json"), `${JSON.stringify(evaluationCase())}\n`, "utf8");
  await writeFile(path.join(packageDir, "operator", "baseline-direct-prompt.md"), "Baseline prompt\n", "utf8");
  await writeFile(path.join(packageDir, "operator", "agentforge-manifest-prompt.md"), "Manifest prompt\n", "utf8");
  await writeFile(path.join(packageDir, "operator", "agentforge-report.json"), "{}\n", "utf8");
  await writeFile(path.join(packageDir, "operator", "agentforge-manifest.json"), "{}\n", "utf8");
  return { root, packageDir };
}

function baseConfig(packageDir: string, outputDir: string, variant: "baseline_direct_prompt" | "agentforge_manifest") {
  return {
    packageDir,
    outputDir,
    run: { runId: `run-${variant}`, variant, sourceRevision: "test-revision" },
    generator: { command: "test-generator", args: ["--write"] },
    preview: { command: "test-preview", args: ["--serve"], previewUrl: "http://127.0.0.1:3123" },
  };
}

test("Baseline branch environment never exposes AgentForge report or manifest paths", () => {
  const environment = buildProductUIImplementationBranchEnvironment({
    executionInputDir: "/tmp/frozen-run-input",
    evaluationCase: evaluationCase(),
    runId: "baseline-run",
    variant: "baseline_direct_prompt",
    outputDir: "/tmp/artifacts",
    projectDir: "/tmp/artifacts/generated-project",
  });
  assert.match(environment.AGENTFORGE_PROMPT_PATH, /baseline-direct-prompt\.md$/);
  assert.equal(environment.AGENTFORGE_REPORT_PATH, undefined);
  assert.equal(environment.AGENTFORGE_MANIFEST_PATH, undefined);
  assert.equal(environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR, "/tmp/artifacts/generated-project");
  assert.equal(environment.AGENTFORGE_EXPERIMENT_PACKAGE_DIR, undefined);
});

test("process runner terminates a timed-out subprocess and preserves its logs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentforge-orchestrator-timeout-"));
  const stdoutPath = path.join(root, "generator.stdout.log");
  const stderrPath = path.join(root, "generator.stderr.log");
  try {
    const result = await runProductUIImplementationProcess({
      command: {
        command: process.execPath,
        args: ["-e", "console.log('started'); setTimeout(() => console.log('late'), 5000);"],
        timeoutMs: 1_000,
      },
      environment: process.env,
      stdoutPath,
      stderrPath,
    });
    assert.equal(result.exitStatus, "timeout");
    assert.equal(result.stdoutPath, stdoutPath);
    assert.equal(result.stderrPath, stderrPath);
    await access(stdoutPath);
    await access(stderrPath);
    assert.match(await readFile(stdoutPath, "utf8"), /started/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("orchestrator stops after generator failure and writes an inspectable summary", async () => {
  const { root, packageDir } = await createPackage();
  try {
    let previewStarted = false;
    let evaluationStarted = false;
    let generatorEnvironment: NodeJS.ProcessEnv | null = null;
    const result = await orchestrateProductUIImplementation(
      baseConfig(packageDir, path.join(root, "artifacts"), "baseline_direct_prompt"),
      {
        runCommand: async (input) => {
          generatorEnvironment = input.environment;
          return processResult("failed", input.stdoutPath, input.stderrPath);
        },
        startPreview: () => {
          previewStarted = true;
          throw new Error("Preview must not start after a generator failure.");
        },
        runEvaluation: async () => {
          evaluationStarted = true;
          throw new Error("Evaluation must not run after a generator failure.");
        },
      },
    );
    assert.equal(result.status, "generator_failed");
    assert.equal(previewStarted, false);
    const capturedGeneratorEnvironment = generatorEnvironment as NodeJS.ProcessEnv | null;
    assert.ok(capturedGeneratorEnvironment);
    const executionInputDir = capturedGeneratorEnvironment.AGENTFORGE_EXECUTION_INPUT_DIR;
    assert.ok(executionInputDir);
    assert.notEqual(executionInputDir, packageDir);
    await access(path.join(executionInputDir, "case.json"));
    await access(path.join(executionInputDir, "baseline-direct-prompt.md"));
    await assert.rejects(access(path.join(executionInputDir, "agentforge-report.json")));
    assert.equal(evaluationStarted, false);
    const summary = JSON.parse(await readFile(result.summaryPath, "utf8"));
    assert.equal(summary.status, "generator_failed");
    assert.equal(summary.runtimeEvidencePath, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("orchestrator refuses browser evaluation when a successful generator omits its evidence summary", async () => {
  const { root, packageDir } = await createPackage();
  try {
    let previewStarted = false;
    let evaluationStarted = false;
    const result = await orchestrateProductUIImplementation(
      baseConfig(packageDir, path.join(root, "artifacts"), "baseline_direct_prompt"),
      {
        runCommand: async (input) => processResult("completed", input.stdoutPath, input.stderrPath),
        startPreview: () => {
          previewStarted = true;
          throw new Error("Preview must not start without a validated generator summary.");
        },
        runEvaluation: async () => {
          evaluationStarted = true;
          throw new Error("Evaluation must not start without a validated generator summary.");
        },
      },
    );
    assert.equal(result.status, "evaluation_failed");
    assert.equal(previewStarted, false);
    assert.equal(evaluationStarted, false);
    assert.match(result.failure ?? "", /claude-generator-summary\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("orchestrator rejects an existing run directory before reusing artifacts", async () => {
  const { root, packageDir } = await createPackage();
  try {
    const config = baseConfig(packageDir, path.join(root, "artifacts"), "baseline_direct_prompt");
    await orchestrateProductUIImplementation(config, {
      runCommand: async (input) => processResult("failed", input.stdoutPath, input.stderrPath),
    });
    await assert.rejects(
      orchestrateProductUIImplementation(config),
      /PRODUCT_UI_ORCHESTRATOR_RUN_DIRECTORY_EXISTS/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("orchestrator passes only branch inputs and forwards process logs into browser evidence metadata", async () => {
  const { root, packageDir } = await createPackage();
  try {
    const environments: NodeJS.ProcessEnv[] = [];
    const generatorCommands: Array<{ cwd?: string }> = [];
    const previewCommands: Array<{ cwd?: string }> = [];
    let previewStopped = false;
    let capturedEvaluation: Record<string, unknown> | null = null;
    const result = await orchestrateProductUIImplementation(
      baseConfig(packageDir, path.join(root, "artifacts"), "agentforge_manifest"),
      {
        runCommand: async (input) => {
          environments.push(input.environment);
          generatorCommands.push(input.command);
          await writeValidGeneratorSummary({
            outputDir: path.dirname(input.stdoutPath),
            runId: "run-agentforge_manifest",
            variant: "agentforge_manifest",
          });
          return processResult("completed", input.stdoutPath, input.stderrPath);
        },
        startPreview: (input) => {
          environments.push(input.environment);
          previewCommands.push(input.command);
          return {
            result: Promise.resolve(processResult("cancelled", input.stdoutPath, input.stderrPath)),
            stop: () => { previewStopped = true; },
          };
        },
        waitForPreview: async () => ({ ready: true, detail: "test preview ready" }),
        runEvaluation: async (config) => {
          capturedEvaluation = config as unknown as Record<string, unknown>;
          return { evidence: {}, outputPath: path.join(root, "runtime-evidence.json") };
        },
      },
    );
    assert.equal(result.status, "completed");
    assert.equal(previewStopped, true);
    assert.equal(environments.length, 2);
    const expectedProjectDir = path.join(root, "artifacts", "run-agentforge_manifest", "generated-project");
    for (const environment of environments) {
      assert.match(environment.AGENTFORGE_PROMPT_PATH ?? "", /agentforge-manifest-prompt\.md$/);
      assert.match(environment.AGENTFORGE_REPORT_PATH ?? "", /agentforge-report\.json$/);
      assert.match(environment.AGENTFORGE_MANIFEST_PATH ?? "", /agentforge-manifest\.json$/);
      assert.equal(environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR, expectedProjectDir);
    }
    assert.equal(generatorCommands[0]?.cwd, undefined);
    assert.equal(previewCommands[0]?.cwd, expectedProjectDir);
    const run = (capturedEvaluation as unknown as { run: Record<string, unknown> }).run;
    const generatorOutputPaths = run.generatorOutputPaths as string[];
    const previewOutputPaths = run.previewOutputPaths as string[];
    assert.equal(generatorOutputPaths.length, 3);
    assert.equal(generatorOutputPaths.filter((item) => item.endsWith(".log")).length, 2);
    assert.equal(generatorOutputPaths.some((item) => item.endsWith("claude-generator-summary.json")), true);
    assert.equal(previewOutputPaths.length, 2);
    assert.equal(previewOutputPaths.every((item) => item.endsWith(".log")), true);
    assert.equal((run.orchestratorOutputPaths as string[])[0]?.endsWith("orchestration-summary.json"), true);
    assert.equal(result.runtimeEvidencePath?.endsWith("runtime-evidence.json"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});