import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { ProductUIImplementationVariantSchema } from "../src/lib/report/contracts";
import {
  ProductUIClaudeGeneratorSummarySchema,
  ProductUIImplementationEvaluationCaseSchema,
  stableJsonSha256,
  textSha256,
  type ProductUIClaudeGeneratorSummary,
  type ProductUIImplementationEvaluationCase,
} from "../src/lib/report/product-ui-implementation-evaluation";

const CLAUDE_GENERATOR_SCHEMA_VERSION = 1 as const;

const ClaudePermissionModeSchema = z.enum(["acceptEdits", "auto"]).default("acceptEdits");

export const ProductUIClaudeGeneratorConfigSchema = z.object({
  // 未传入时使用编排器提供的隔离项目目录，避免实验配置写死某一次 runId。
  projectDir: z.string().trim().min(1).max(1_000).optional(),
  // 可选的受版本控制种子目录；两个实验分支必须配置同一份种子。
  seedDir: z.string().trim().min(1).max(1_000),
  claudeCommand: z.string().trim().min(1).max(1_000).default("claude"),
  execution: z.object({
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
    promptVersion: z.string().trim().min(1).max(160),
    parameters: z.record(z.string(), z.unknown()).default({}),
    adapterVersion: z.string().trim().min(1).max(160),
  }).strict(),
  permissionMode: ClaudePermissionModeSchema,
  allowedTools: z.array(z.string().trim().min(1).max(240)).min(1).max(40).default([
    "Read",
    "Glob",
    "Grep",
    "Edit",
    "Write",
    "Bash",
  ]),
}).strict();

export type ProductUIClaudeGeneratorConfig = z.infer<typeof ProductUIClaudeGeneratorConfigSchema>;

export interface ClaudeCodeCommand {
  command: string;
  args: string[];
}

export interface ClaudeCodeExecutionInput {
  command: ClaudeCodeCommand;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  prompt: string;
}

export interface ClaudeCodeExecutionResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export type ProductUIClaudeGeneratorResult = ProductUIClaudeGeneratorSummary;

export interface ProductUIClaudeGeneratorDependencies {
  execute?: (input: ClaudeCodeExecutionInput) => Promise<ClaudeCodeExecutionResult>;
  now?: () => Date;
}

function requiredEnvironment(name: string, environment: NodeJS.ProcessEnv) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_ENV_MISSING:${name}`);
  return value;
}


interface SeedSnapshot {
  sha256: string;
  fileCount: number;
}

async function readSeedSnapshot(sourceDir: string): Promise<SeedSnapshot> {
  const sourceStat = await lstat(sourceDir);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_SEED_DIR_MUST_BE_A_REAL_DIRECTORY");
  }

  const digest = createHash("sha256");
  let fileCount = 0;
  async function visit(currentDir: string, relativeDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      const relativePath = path.posix.join(relativeDir, entry.name);
      const stat = await lstat(entryPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_SEED_SYMLINK_UNSUPPORTED:${relativePath}`);
      }
      if (stat.isDirectory()) {
        digest.update(`directory:${relativePath}\n`);
        await visit(entryPath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_SEED_ENTRY_UNSUPPORTED:${relativePath}`);
      }
      const contents = await readFile(entryPath);
      digest.update(`file:${relativePath}:${contents.length}:`);
      digest.update(contents);
      digest.update("\n");
      fileCount += 1;
    }
  }

  await visit(sourceDir, "");
  if (fileCount === 0) throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_SEED_DIR_EMPTY");
  return { sha256: digest.digest("hex"), fileCount };
}

async function prepareSeedProject(seedDir: string | undefined, projectDir: string, artifactDir: string) {
  if (!seedDir) return null;
  const sourceDir = path.resolve(seedDir);
  if (sourceDir === projectDir || isStrictChildPath(sourceDir, projectDir) || isStrictChildPath(projectDir, sourceDir)) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_SEED_AND_PROJECT_DIR_OVERLAP");
  }
  const source = await readSeedSnapshot(sourceDir);
  try {
    await cp(sourceDir, projectDir, { recursive: true, force: false, errorOnExist: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_SEED_COPY_FAILED:${detail}`);
  }
  const copied = await readSeedSnapshot(projectDir);
  if (source.sha256 !== copied.sha256 || source.fileCount !== copied.fileCount) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_SEED_COPY_HASH_MISMATCH");
  }
  const snapshot = { sourceDir, ...source };
  await writeJson(path.join(artifactDir, "seed-snapshot.json"), snapshot);
  return snapshot;
}
function isStrictChildPath(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertSafeCliValue(value: string, name: string) {
  // 命令和参数均按数组传入子进程；这里只拒绝 shell 元字符、控制字符和空值。
  if (value.length === 0 || value.length > 1_000 || /[&|<>^%!"'`\r\n\0]/.test(value)) {
    throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_UNSAFE_${name.toUpperCase()}`);
  }
}

function claudeCommandForPlatform(command: string, args: string[]): ClaudeCodeCommand {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(command)) {
    return { command, args };
  }

  // Windows 的 .cmd 无法被 spawn(shell: false) 直接执行；参数被逐项传入 cmd，且上游已限制可注入字符。
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", "call", command, ...args],
  };
}

export function buildClaudeCodeCommand(config: ProductUIClaudeGeneratorConfig): ClaudeCodeCommand {
  assertSafeCliValue(config.claudeCommand, "claude_command");
  assertSafeCliValue(config.execution.model, "model");
  for (const tool of config.allowedTools) assertSafeCliValue(tool, "allowed_tool");

  const args = [
    "--print",
    "--input-format",
    "text",
    "--output-format",
    "json",
    "--permission-mode",
    config.permissionMode,
    "--allowedTools",
    config.allowedTools.join(","),
  ];
  args.push("--model", config.execution.model);
  return claudeCommandForPlatform(config.claudeCommand, args);
}

export function buildProductUIClaudeImplementationPrompt(input: {
  frozenPrompt: string;
  projectDir: string;
}) {
  return [
    "You are the downstream implementation executor in a reproducible website-generation experiment.",
    `Create or modify the website only inside this isolated project directory: ${input.projectDir}`,
    "Do not read from or modify the AgentForge repository, the experiment package, or files outside that project directory.",
    "Do not claim visual quality, acceptance, or runtime results without actually running the generated project.",
    "Use the frozen implementation input below exactly as the task source. It may be a direct requirement or an AgentForge implementation manifest.",
    "",
    "--- BEGIN FROZEN IMPLEMENTATION INPUT ---",
    input.frozenPrompt,
    "--- END FROZEN IMPLEMENTATION INPUT ---",
  ].join("\n");
}

export function buildClaudeChildEnvironment(environment: NodeJS.ProcessEnv, projectDir: string): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = { ...environment };
  // 下游模型只接收项目目录；实验包路径、报告路径和 Manifest 路径不会继续透传。
  for (const key of Object.keys(childEnvironment)) {
    if (key.startsWith("AGENTFORGE_")) delete childEnvironment[key];
  }
  childEnvironment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR = projectDir;
  return childEnvironment;
}

export async function executeClaudeCode(input: ClaudeCodeExecutionInput): Promise<ClaudeCodeExecutionResult> {
  return await new Promise<ClaudeCodeExecutionResult>((resolve) => {
    let child;
    try {
      child = spawn(input.command.command, input.command.args, {
        cwd: input.cwd,
        env: input.environment,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let spawnError: string | null = null;
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.once("error", (error) => {
      spawnError = error.message;
    });
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        error: spawnError,
      });
    });
    child.stdin?.end(input.prompt);
  });
}

function promptExpectation(caseDefinition: ProductUIImplementationEvaluationCase, variant: "baseline_direct_prompt" | "agentforge_manifest") {
  const expected = caseDefinition.variants.find((item) => item.variant === variant);
  if (!expected) throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_VARIANT_NOT_REGISTERED:${variant}`);
  return expected.promptSha256;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runProductUIClaudeGenerator(
  rawConfig: unknown,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ProductUIClaudeGeneratorDependencies = {},
): Promise<ProductUIClaudeGeneratorResult> {
  const config = ProductUIClaudeGeneratorConfigSchema.parse(rawConfig);
  const artifactDir = path.resolve(requiredEnvironment("AGENTFORGE_ARTIFACT_DIR", environment));
  const configuredProjectDir = config.projectDir ? path.resolve(config.projectDir) : null;
  const environmentProjectDir = environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR
    ? path.resolve(environment.AGENTFORGE_IMPLEMENTATION_PROJECT_DIR)
    : null;
  if (configuredProjectDir && environmentProjectDir && configuredProjectDir !== environmentProjectDir) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_PROJECT_DIR_DOES_NOT_MATCH_ORCHESTRATOR");
  }
  const projectDir = configuredProjectDir ?? environmentProjectDir;
  if (!projectDir) throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_PROJECT_DIR_MISSING");
  if (!isStrictChildPath(artifactDir, projectDir)) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_PROJECT_DIR_MUST_BE_INSIDE_ARTIFACT_DIR");
  }

  const runId = requiredEnvironment("AGENTFORGE_RUN_ID", environment);
  const variant = ProductUIImplementationVariantSchema.parse(requiredEnvironment("AGENTFORGE_VARIANT", environment));
  const casePath = path.resolve(requiredEnvironment("AGENTFORGE_CASE_PATH", environment));
  const frozenPromptPath = path.resolve(requiredEnvironment("AGENTFORGE_PROMPT_PATH", environment));
  if (variant === "baseline_direct_prompt" && (environment.AGENTFORGE_REPORT_PATH || environment.AGENTFORGE_MANIFEST_PATH)) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_BASELINE_INPUT_LEAK");
  }

  const [frozenPrompt, caseRaw] = await Promise.all([
    readFile(frozenPromptPath, "utf8"),
    readFile(casePath, "utf8"),
  ]);
  const caseDefinition = ProductUIImplementationEvaluationCaseSchema.parse(JSON.parse(caseRaw));
  const frozenPromptSha256 = textSha256(frozenPrompt);
  const expectedPromptSha256 = promptExpectation(caseDefinition, variant);
  if (frozenPromptSha256 !== expectedPromptSha256) {
    throw new Error("PRODUCT_UI_CLAUDE_GENERATOR_FROZEN_PROMPT_HASH_MISMATCH");
  }

  const inputPath = path.join(artifactDir, "claude-generator-input.md");
  const responsePath = path.join(artifactDir, "claude-response.json");
  const stderrPath = path.join(artifactDir, "claude.stderr.log");
  const summaryPath = path.join(artifactDir, "claude-generator-summary.json");
  const prompt = buildProductUIClaudeImplementationPrompt({ frozenPrompt, projectDir });
  const command = buildClaudeCodeCommand(config);
  const startedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  await mkdir(artifactDir, { recursive: true });
  // 每次运行先复制同一份受控种子，避免两个实验分支沿用不同的初始项目状态。
  const seed = await prepareSeedProject(config.seedDir, projectDir, artifactDir);
  if (!seed) await mkdir(projectDir, { recursive: true });
  await writeFile(inputPath, `${prompt}\n`, "utf8");
  const execution = await (dependencies.execute ?? executeClaudeCode)({
    command,
    cwd: projectDir,
    environment: buildClaudeChildEnvironment(environment, projectDir),
    prompt,
  });
  await Promise.all([
    writeFile(responsePath, execution.stdout, "utf8"),
    writeFile(stderrPath, execution.stderr, "utf8"),
  ]);

  const result = ProductUIClaudeGeneratorSummarySchema.parse({
    schemaVersion: CLAUDE_GENERATOR_SCHEMA_VERSION,
    type: "agentforge_product_ui_claude_generator",
    runId,
    caseId: caseDefinition.caseId,
    variant,
    projectDir,
    frozenPromptPath,
    frozenPromptSha256,
    expectedPromptSha256,
    claudeCommand: command,
    execution: {
      provider: config.execution.provider,
      model: config.execution.model,
      promptVersion: config.execution.promptVersion,
      parametersSha256: stableJsonSha256(config.execution.parameters),
      adapterVersion: config.execution.adapterVersion,
    },
    permissionMode: config.permissionMode,
    allowedTools: config.allowedTools,
    seed,
    startedAt,
    completedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    exitCode: execution.exitCode,
    signal: execution.signal,
    responsePath,
    stderrPath,
    failure: execution.error ?? (execution.exitCode === 0 ? null : `Claude Code exited with ${execution.exitCode ?? "no exit code"}.`),
  });
  await writeJson(summaryPath, result);
  return result;
}

function requiredFlag(name: string) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`PRODUCT_UI_CLAUDE_GENERATOR_FLAG_MISSING:${name}`);
  return value;
}

async function main() {
  const configPath = requiredFlag("--config");
  const rawConfig = JSON.parse(await readFile(path.resolve(configPath), "utf8"));
  const result = await runProductUIClaudeGenerator(rawConfig);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failure) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
