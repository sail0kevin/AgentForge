import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildClaudeChildEnvironment,
  buildClaudeCodeCommand,
  buildProductUIClaudeImplementationPrompt,
  runProductUIClaudeGenerator,
} from "../../../scripts/product-ui-implementation-claude-generator";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function evaluationCase(baselinePrompt: string, agentforgePrompt: string) {
  return {
    schemaVersion: 1 as const,
    studyId: "claude-generator-study",
    caseId: "claude-generator-case",
    requirement: "Create a reviewable website.",
    reportGroupId: "claude-generator-reports",
    solutionId: "claude-generator-solution",
    routes: ["/"],
    expectedAcceptanceIds: ["route.home"],
    acceptanceProbes: [{ acceptanceId: "route.home", kind: "route" as const, route: "/" }],
    downstreamModel: {
      provider: "anthropic",
      model: "fixed-claude-model",
      promptVersion: "claude-adapter-v1",
      parameters: { temperature: 0 },
      adapterVersion: "test-adapter-v1",
    },
    minimumCaseCount: 1,
    minimumRaterCount: 1,
    humanReviewRubricVersion: "claude-adapter-rubric-v1",
    claimBoundary: "This test cannot prove website quality.",
    variants: [
      {
        variant: "baseline_direct_prompt" as const,
        promptSha256: sha256(baselinePrompt),
        reportSha256: null,
        manifestSha256: null,
      },
      {
        variant: "agentforge_manifest" as const,
        promptSha256: sha256(agentforgePrompt),
        reportSha256: "c".repeat(64),
        manifestSha256: "d".repeat(64),
      },
    ],
  };
}

async function createFixture(variant: "baseline_direct_prompt" | "agentforge_manifest") {
  const root = await mkdtemp(path.join(tmpdir(), "agentforge-claude-generator-"));
  const packageDir = path.join(root, "package");
  const artifactDir = path.join(root, "artifacts", `run-${variant}`);
  const seedDir = path.join(root, "seed");
  const baselinePrompt = "Baseline frozen requirement\n";
  const agentforgePrompt = "AgentForge frozen manifest\n";
  const casePath = path.join(packageDir, "case.json");
  const promptPath = path.join(packageDir, "operator", variant === "baseline_direct_prompt" ? "baseline-direct-prompt.md" : "agentforge-manifest-prompt.md");
  await mkdir(path.dirname(promptPath), { recursive: true });
  await mkdir(seedDir, { recursive: true });
  await writeFile(path.join(seedDir, "index.html"), "<main>Seed</main>\n", "utf8");
  await writeFile(casePath, `${JSON.stringify(evaluationCase(baselinePrompt, agentforgePrompt))}\n`, "utf8");
  await writeFile(promptPath, variant === "baseline_direct_prompt" ? baselinePrompt : agentforgePrompt, "utf8");
  return {
    root,
    artifactDir,
    promptPath,
    seedDir,
    environment: {
      AGENTFORGE_ARTIFACT_DIR: artifactDir,
      AGENTFORGE_RUN_ID: `run-${variant}`,
      AGENTFORGE_VARIANT: variant,
      AGENTFORGE_CASE_PATH: casePath,
      AGENTFORGE_PROMPT_PATH: promptPath,
      NODE_ENV: "test",
    } satisfies NodeJS.ProcessEnv,
  };
}

function claudeConfig(projectDir: string, seedDir: string) {
  return {
    projectDir,
    seedDir,
    claudeCommand: "claude",
    execution: {
      provider: "anthropic",
      model: "fixed-claude-model",
      promptVersion: "claude-adapter-v1",
      parameters: { temperature: 0 },
      adapterVersion: "test-adapter-v1",
    },
  };
}

test("Claude child environment does not forward frozen package or report paths", () => {
  const environment = buildClaudeChildEnvironment({
    AGENTFORGE_ARTIFACT_DIR: "/tmp/artifacts",
    AGENTFORGE_PROMPT_PATH: "/tmp/package/operator/baseline-direct-prompt.md",
    AGENTFORGE_REPORT_PATH: "/tmp/package/operator/agentforge-report.json",
    AGENTFORGE_MANIFEST_PATH: "/tmp/package/operator/agentforge-manifest.json",
    OTHER_VALUE: "retained",
    NODE_ENV: "test",
  }, "/tmp/artifacts/generated-project");
  assert.equal(environment.AGENTFORGE_ARTIFACT_DIR, undefined);
  assert.equal(environment.AGENTFORGE_PROMPT_PATH, undefined);
  assert.equal(environment.AGENTFORGE_REPORT_PATH, undefined);
  assert.equal(environment.AGENTFORGE_MANIFEST_PATH, undefined);
  assert.equal(environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR, "/tmp/artifacts/generated-project");
  assert.equal(environment.OTHER_VALUE, "retained");
});

test("Claude adapter uses a frozen prompt only and writes inspectable artifacts", async () => {
  const fixture = await createFixture("baseline_direct_prompt");
  try {
    const executionInputs: Array<{ cwd: string; prompt: string; environment: NodeJS.ProcessEnv }> = [];
    const result = await runProductUIClaudeGenerator(
      claudeConfig(path.join(fixture.artifactDir, "generated-project"), fixture.seedDir),
      fixture.environment,
      {
        now: () => new Date("2026-08-04T00:00:00.000Z"),
        execute: async (input) => {
          executionInputs.push(input);
          return { exitCode: 0, signal: null, stdout: '{"result":"generated"}\n', stderr: "", error: null };
        },
      },
    );
    assert.equal(result.failure, null);
    const executionInput = executionInputs[0];
    assert.ok(executionInput);
    assert.equal(result.variant, "baseline_direct_prompt");
    assert.match(result.frozenPromptSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.frozenPromptSha256, result.expectedPromptSha256);
    assert.equal(executionInput.cwd, path.join(fixture.artifactDir, "generated-project"));
    assert.match(executionInput.prompt, /Baseline frozen requirement/);
    assert.equal((executionInput.prompt).includes("AgentForge frozen manifest"), false);
    assert.equal(executionInput.environment.AGENTFORGE_PROMPT_PATH, undefined);
    assert.equal(executionInput.environment.AGENTFORGE_REPORT_PATH, undefined);
    assert.equal(executionInput.environment.AGENTFORGE_MANIFEST_PATH, undefined);
    assert.equal(executionInput.environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR, path.join(fixture.artifactDir, "generated-project"));
    assert.equal(await readFile(result.responsePath, "utf8"), '{"result":"generated"}\n');
    const summary = JSON.parse(await readFile(path.join(fixture.artifactDir, "claude-generator-summary.json"), "utf8"));
    assert.equal(summary.failure, null);
    assert.equal(summary.caseId, "claude-generator-case");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Claude adapter rejects a project outside this run artifact directory", async () => {
  const fixture = await createFixture("agentforge_manifest");
  try {
    await assert.rejects(
      () => runProductUIClaudeGenerator(
        claudeConfig(path.join(fixture.root, "outside-project"), fixture.seedDir),
        fixture.environment,
      ),
      /PROJECT_DIR_MUST_BE_INSIDE_ARTIFACT_DIR/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Claude adapter detects a modified frozen prompt before model execution", async () => {
  const fixture = await createFixture("agentforge_manifest");
  try {
    await writeFile(fixture.promptPath, "Modified after package freeze\n", "utf8");
    await assert.rejects(
      () => runProductUIClaudeGenerator(
        claudeConfig(path.join(fixture.artifactDir, "generated-project"), fixture.seedDir),
        fixture.environment,
      ),
      /FROZEN_PROMPT_HASH_MISMATCH/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Claude adapter copies a controlled seed and records its immutable snapshot", async () => {
  const fixture = await createFixture("agentforge_manifest");
  try {
    const seedDir = path.join(fixture.root, "seed");
    const projectDir = path.join(fixture.artifactDir, "generated-project");
    await mkdir(path.join(seedDir, "assets"), { recursive: true });
    await writeFile(path.join(seedDir, "index.html"), "<main>Seed</main>\n", "utf8");
    await writeFile(path.join(seedDir, "assets", "token.txt"), "seed-token\n", "utf8");

    const result = await runProductUIClaudeGenerator(
      claudeConfig(projectDir, seedDir),
      fixture.environment,
      {
        now: () => new Date("2026-08-04T00:00:00.000Z"),
        execute: async () => ({ exitCode: 0, signal: null, stdout: "{}\n", stderr: "", error: null }),
      },
    );

    assert.ok(result.seed);
    assert.equal(result.seed.sourceDir, path.resolve(seedDir));
    assert.equal(result.seed.fileCount, 2);
    assert.match(result.seed.sha256, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(path.join(projectDir, "index.html"), "utf8"), "<main>Seed</main>\n");
    assert.equal(await readFile(path.join(projectDir, "assets", "token.txt"), "utf8"), "seed-token\n");
    const snapshot = JSON.parse(await readFile(path.join(fixture.artifactDir, "seed-snapshot.json"), "utf8"));
    assert.deepEqual(snapshot, result.seed);

    await assert.rejects(
      () => runProductUIClaudeGenerator(
        claudeConfig(projectDir, seedDir),
        fixture.environment,
      ),
      /SEED_COPY_FAILED/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Claude adapter rejects a configured project directory that differs from the orchestrator directory", async () => {
  const fixture = await createFixture("baseline_direct_prompt");
  try {
    const orchestratorProjectDir = path.join(fixture.artifactDir, "generated-project");
    const environment = {
      ...fixture.environment,
      AGENTFORGE_IMPLEMENTATION_PROJECT_DIR: orchestratorProjectDir,
    } satisfies NodeJS.ProcessEnv;
    await assert.rejects(
      () => runProductUIClaudeGenerator(
        claudeConfig(path.join(fixture.artifactDir, "different-project"), fixture.seedDir),
        environment,
      ),
      /PROJECT_DIR_DOES_NOT_MATCH_ORCHESTRATOR/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
test("Claude command keeps values as arguments and does not enable permission bypass", () => {
  const command = buildClaudeCodeCommand({
    projectDir: "C:/tmp/project",
    seedDir: "C:/tmp/seed",
    claudeCommand: "claude",
    execution: {
      provider: "anthropic",
      model: "fixed-claude-model",
      promptVersion: "claude-adapter-v1",
      parameters: { temperature: 0 },
      adapterVersion: "test-adapter-v1",
    },
    permissionMode: "acceptEdits",
    allowedTools: ["Read", "Edit", "Write"],
  });
  assert.equal(command.args.includes("--dangerously-skip-permissions"), false);
  assert.equal(command.args.includes("bypassPermissions"), false);
  assert.equal(command.args.includes("--print"), true);
  assert.equal(command.args.includes("--output-format"), true);
  assert.match(buildProductUIClaudeImplementationPrompt({ frozenPrompt: "Frozen input", projectDir: "C:/tmp/project" }), /only inside this isolated project directory/);
});