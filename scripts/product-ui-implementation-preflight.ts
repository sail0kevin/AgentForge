import { spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DevelopmentReportSchema } from "../src/lib/report/contracts";
import {
  ProductUIImplementationEvaluationCaseSchema,
  stableJsonSha256,
  textSha256,
} from "../src/lib/report/product-ui-implementation-evaluation";
import {
  ProductUIClaudeGeneratorConfigSchema,
  type ProductUIClaudeGeneratorConfig,
} from "./product-ui-implementation-claude-generator";
import {
  ProductUIImplementationOrchestratorConfigSchema,
  type ProductUIImplementationOrchestratorConfig,
} from "./product-ui-implementation-orchestrate";

const PreflightStatusSchema = z.enum(["pass", "warning", "fail"]);

export const ProductUIImplementationPreflightCheckSchema = z.object({
  id: z.string().min(1).max(160),
  status: PreflightStatusSchema,
  message: z.string().min(1).max(2_000),
  detail: z.string().max(4_000).optional(),
}).strict();

export const ProductUIImplementationPreflightResultSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("agentforge_product_ui_implementation_preflight"),
  ready: z.boolean(),
  packageDir: z.string().min(1),
  configPath: z.string().min(1),
  checkedAt: z.string().datetime(),
  checks: z.array(ProductUIImplementationPreflightCheckSchema),
  blockingReasons: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();

export type ProductUIImplementationPreflightCheck = z.infer<typeof ProductUIImplementationPreflightCheckSchema>;
export type ProductUIImplementationPreflightResult = z.infer<typeof ProductUIImplementationPreflightResultSchema>;

export interface ProductUIImplementationPreflightDependencies {
  now?: () => Date;
  probeCommand?: (input: { command: string; cwd: string }) => Promise<{ ok: boolean; detail: string }>;
}

export interface ProductUIImplementationPreflightOptions {
  packageDir: string;
  configPath: string;
  cwd?: string;
  probeCommands?: boolean;
}

function isStrictChildPath(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathsOverlap(left: string, right: string) {
  return left === right || isStrictChildPath(left, right) || isStrictChildPath(right, left);
}

function addCheck(
  checks: ProductUIImplementationPreflightCheck[],
  id: string,
  status: z.infer<typeof PreflightStatusSchema>,
  message: string,
  detail?: string,
) {
  checks.push(ProductUIImplementationPreflightCheckSchema.parse({ id, status, message, ...(detail ? { detail } : {}) }));
}

async function pathKind(inputPath: string) {
  try {
    const stat = await lstat(inputPath);
    return stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
  } catch {
    return "missing";
  }
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function findConfigArgument(command: { command: string; args: string[] }) {
  const index = command.args.findIndex((value) => value === "--config" || value.startsWith("--config="));
  if (index === -1) return null;
  const value = command.args[index]!.startsWith("--config=")
    ? command.args[index]!.slice("--config=".length)
    : command.args[index + 1];
  return value?.trim() || null;
}

function isBuiltInClaudeGenerator(command: { command: string; args: string[] }) {
  return [command.command, ...command.args].join(" ").includes("product-ui-implementation-claude-generator");
}

function commandForProbe(command: string) {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(command)) return { command, args: ["--version"] };
  return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "call", command, "--version"] };
}

export async function probeExecutableCommand(input: { command: string; cwd: string }) {
  return await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const probe = commandForProbe(input.command);
    let stderr = "";
    let stdout = "";
    let settled = false;
    const finish = (result: { ok: boolean; detail: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let child;
    try {
      child = spawn(probe.command, probe.args, {
        cwd: input.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish({ ok: false, detail: error instanceof Error ? error.message : String(error) });
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", (error) => finish({ ok: false, detail: error.message }));
    child.once("close", (code, signal) => {
      if (code === 0) {
        finish({ ok: true, detail: (stdout || stderr).trim().slice(0, 500) || "command responded successfully" });
        return;
      }
      finish({ ok: false, detail: `exitCode=${code ?? "null"}, signal=${signal ?? "none"}, output=${(stderr || stdout).trim().slice(0, 500)}` });
    });
  });
}

async function compareGeneratorConfig(
  checks: ProductUIImplementationPreflightCheck[],
  generatorConfig: ProductUIClaudeGeneratorConfig,
  evaluationCase: z.infer<typeof ProductUIImplementationEvaluationCaseSchema>,
  blockingReasons: string[],
) {
  const expected = evaluationCase.downstreamModel;
  const values: Array<[string, string, string]> = [
    ["provider", generatorConfig.execution.provider, expected.provider],
    ["model", generatorConfig.execution.model, expected.model],
    ["promptVersion", generatorConfig.execution.promptVersion, expected.promptVersion],
    ["adapterVersion", generatorConfig.execution.adapterVersion, expected.adapterVersion],
  ];
  for (const [field, actual, wanted] of values) {
    const matches = actual === wanted;
    addCheck(checks, `generator.execution.${field}`, matches ? "pass" : "fail", matches ? `${field} matches case.json.` : `${field} does not match case.json.`, `${actual} !== ${wanted}`);
    if (!matches) blockingReasons.push(`generator.execution.${field} mismatch`);
  }
  const parametersMatch = stableJsonSha256(generatorConfig.execution.parameters) === stableJsonSha256(expected.parameters);
  addCheck(checks, "generator.execution.parameters", parametersMatch ? "pass" : "fail", parametersMatch ? "parameters match case.json." : "parameters do not match case.json.");
  if (!parametersMatch) blockingReasons.push("generator.execution.parameters mismatch");
}

export async function runProductUIImplementationPreflight(
  rawConfig: unknown,
  options: ProductUIImplementationPreflightOptions,
  dependencies: ProductUIImplementationPreflightDependencies = {},
): Promise<ProductUIImplementationPreflightResult> {
  const checks: ProductUIImplementationPreflightCheck[] = [];
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const rootDir = path.resolve(options.cwd ?? process.cwd());
  const packageDir = path.resolve(rootDir, options.packageDir);
  const configPath = path.resolve(rootDir, options.configPath);
  let config: ProductUIImplementationOrchestratorConfig;
  let evaluationCase: z.infer<typeof ProductUIImplementationEvaluationCaseSchema> | null = null;

  try {
    config = ProductUIImplementationOrchestratorConfigSchema.parse(rawConfig);
    addCheck(checks, "orchestrator.config.schema", "pass", "orchestrator config matches the schema.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    addCheck(checks, "orchestrator.config.schema", "fail", "orchestrator config is invalid.", detail);
    blockingReasons.push("orchestrator config schema validation failed");
    const result = ProductUIImplementationPreflightResultSchema.parse({
      schemaVersion: 1,
      type: "agentforge_product_ui_implementation_preflight",
      ready: false,
      packageDir,
      configPath,
      checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      checks,
      blockingReasons,
      warnings,
    });
    return result;
  }

  const packageKind = await pathKind(packageDir);
  addCheck(checks, "package.directory", packageKind === "directory" ? "pass" : "fail", packageKind === "directory" ? "experiment package directory exists." : "experiment package directory must be a real directory.", `${packageDir} is ${packageKind}`);
  if (packageKind !== "directory") blockingReasons.push("experiment package directory is missing or invalid");

  const configuredPackageDir = path.resolve(rootDir, config.packageDir);
  const packageBindingMatches = configuredPackageDir === packageDir;
  addCheck(checks, "orchestrator.packageDir", packageBindingMatches ? "pass" : "fail", packageBindingMatches ? "orchestrator packageDir matches --package-dir." : "orchestrator packageDir does not match --package-dir.", `${configuredPackageDir} !== ${packageDir}`);
  if (!packageBindingMatches) blockingReasons.push("package directory binding mismatch");

  const outputDir = path.resolve(rootDir, config.outputDir);
  const runOutputDir = path.resolve(outputDir, config.run.runId);
  const outputOverlap = pathsOverlap(packageDir, outputDir);
  addCheck(checks, "output.package-isolation", outputOverlap ? "fail" : "pass", outputOverlap ? "outputDir overlaps the experiment package." : "outputDir is isolated from the experiment package.", outputOverlap ? `${packageDir} <-> ${outputDir}` : undefined);
  if (outputOverlap) blockingReasons.push("output directory overlaps experiment package");
  const runOutputKind = await pathKind(runOutputDir);
  addCheck(checks, "output.run-directory", runOutputKind === "missing" ? "pass" : "fail", runOutputKind === "missing" ? "run output directory is available." : "run output directory already exists; use a fresh runId.", `${runOutputDir} is ${runOutputKind}`);
  if (runOutputKind !== "missing") blockingReasons.push("run output directory already exists");

  const casePath = path.join(packageDir, "case.json");
  try {
    evaluationCase = ProductUIImplementationEvaluationCaseSchema.parse(await readJson(casePath));
    addCheck(checks, "package.case.schema", "pass", "case.json matches the evaluation-case schema.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    addCheck(checks, "package.case.schema", "fail", "case.json is missing or invalid.", detail);
    blockingReasons.push("case.json validation failed");
  }

  const requiredFiles = evaluationCase
    ? [
        ["baseline_prompt", path.join(packageDir, "operator", "baseline-direct-prompt.md")],
        ["agentforge_prompt", path.join(packageDir, "operator", "agentforge-manifest-prompt.md")],
        ["agentforge_report", path.join(packageDir, "operator", "agentforge-report.json")],
        ["agentforge_manifest", path.join(packageDir, "operator", "agentforge-manifest.json")],
      ] as const
    : [];
  for (const [id, filePath] of requiredFiles) {
    const kind = await pathKind(filePath);
    const ok = kind === "file";
    addCheck(checks, `package.${id}.file`, ok ? "pass" : "fail", ok ? `${id} exists.` : `${id} must be a regular file.`, `${filePath} is ${kind}`);
    if (!ok) blockingReasons.push(`${id} is missing or invalid`);
  }

  if (evaluationCase) {
    const baselinePromptPath = path.join(packageDir, "operator", "baseline-direct-prompt.md");
    const agentforgePromptPath = path.join(packageDir, "operator", "agentforge-manifest-prompt.md");
    for (const [id, filePath, expectedHash] of [
      ["baseline_prompt_hash", baselinePromptPath, evaluationCase.variants.find((item) => item.variant === "baseline_direct_prompt")!.promptSha256],
      ["agentforge_prompt_hash", agentforgePromptPath, evaluationCase.variants.find((item) => item.variant === "agentforge_manifest")!.promptSha256],
    ] as const) {
      try {
        const actualHash = textSha256(await readFile(filePath, "utf8"));
        const ok = actualHash === expectedHash;
        addCheck(checks, `package.${id}`, ok ? "pass" : "fail", ok ? "frozen prompt hash matches case.json." : "frozen prompt hash does not match case.json.", `${actualHash} !== ${expectedHash}`);
        if (!ok) blockingReasons.push(`${id} mismatch`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        addCheck(checks, `package.${id}`, "fail", "could not hash frozen prompt.", detail);
        blockingReasons.push(`${id} could not be checked`);
      }
    }

    try {
      const report = DevelopmentReportSchema.parse(await readJson(path.join(packageDir, "operator", "agentforge-report.json")));
      const reportHash = stableJsonSha256(report);
      const expectedHash = evaluationCase.variants.find((item) => item.variant === "agentforge_manifest")!.reportSha256;
      const ok = reportHash === expectedHash;
      addCheck(checks, "package.agentforge_report.binding", ok ? "pass" : "fail", ok ? "AgentForge report hash matches case.json." : "AgentForge report hash does not match case.json.", `${reportHash} !== ${expectedHash}`);
      if (!ok) blockingReasons.push("AgentForge report hash mismatch");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      addCheck(checks, "package.agentforge_report.schema", "fail", "AgentForge report is missing or invalid.", detail);
      blockingReasons.push("AgentForge report validation failed");
    }

    try {
      const manifest = await readJson(path.join(packageDir, "operator", "agentforge-manifest.json")) as { schemaVersion?: unknown; manifestType?: unknown };
      const shapeOk = manifest.schemaVersion === 1 && manifest.manifestType === "agentforge_product_ui_implementation";
      const actualHash = stableJsonSha256(manifest);
      const expectedHash = evaluationCase.variants.find((item) => item.variant === "agentforge_manifest")!.manifestSha256;
      const bindingOk = actualHash === expectedHash;
      addCheck(checks, "package.agentforge_manifest.schema", shapeOk ? "pass" : "fail", shapeOk ? "AgentForge manifest has the expected type and version." : "AgentForge manifest type or version is invalid.");
      addCheck(checks, "package.agentforge_manifest.binding", bindingOk ? "pass" : "fail", bindingOk ? "AgentForge manifest hash matches case.json." : "AgentForge manifest hash does not match case.json.", `${actualHash} !== ${expectedHash}`);
      if (!shapeOk) blockingReasons.push("AgentForge manifest schema marker invalid");
      if (!bindingOk) blockingReasons.push("AgentForge manifest hash mismatch");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      addCheck(checks, "package.agentforge_manifest.schema", "fail", "AgentForge manifest is missing or invalid.", detail);
      blockingReasons.push("AgentForge manifest validation failed");
    }
  }

  const generatorConfigArgument = findConfigArgument(config.generator);
  const builtInGenerator = isBuiltInClaudeGenerator(config.generator);
  if (!generatorConfigArgument && builtInGenerator) {
    addCheck(checks, "generator.config.path", "fail", "built-in Claude generator command must include --config.");
    blockingReasons.push("Claude generator config path is missing");
  }
  if (generatorConfigArgument && evaluationCase) {
    const generatorCwd = path.resolve(rootDir, config.generator.cwd ?? ".");
    const generatorConfigPath = path.resolve(generatorCwd, generatorConfigArgument);
    try {
      const generatorConfig = ProductUIClaudeGeneratorConfigSchema.parse(await readJson(generatorConfigPath));
      addCheck(checks, "generator.config.schema", "pass", "Claude generator config matches the schema.");
      await compareGeneratorConfig(checks, generatorConfig, evaluationCase, blockingReasons);
      const seedDir = path.resolve(generatorCwd, generatorConfig.seedDir);
      const seedKind = await pathKind(seedDir);
      addCheck(checks, "generator.seed.directory", seedKind === "directory" ? "pass" : "fail", seedKind === "directory" ? "seed directory exists." : "seedDir must be a real directory.", `${seedDir} is ${seedKind}`);
      if (seedKind !== "directory") blockingReasons.push("seed directory is missing or invalid");
      if (pathsOverlap(seedDir, outputDir)) {
        addCheck(checks, "generator.seed.isolation", "fail", "seedDir overlaps outputDir.");
        blockingReasons.push("seedDir overlaps outputDir");
      } else {
        addCheck(checks, "generator.seed.isolation", "pass", "seedDir is isolated from outputDir.");
      }
      if (options.probeCommands !== false) {
        const probe = await (dependencies.probeCommand ?? probeExecutableCommand)({ command: generatorConfig.claudeCommand, cwd: generatorCwd });
        addCheck(checks, "generator.claude.command", probe.ok ? "pass" : "fail", probe.ok ? "Claude CLI is resolvable without invoking a model." : "Claude CLI could not be resolved.", probe.detail);
        if (!probe.ok) blockingReasons.push("Claude CLI is not resolvable");
      } else {
        addCheck(checks, "generator.claude.command", "warning", "Claude CLI probe was skipped.");
        warnings.push("Claude CLI was not probed");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      addCheck(checks, "generator.config.schema", "fail", "Claude generator config is missing or invalid.", detail);
      blockingReasons.push("Claude generator config validation failed");
    }
  }

  const commandChecks: Array<[string, string, string]> = [
    ["generator.process.command", config.generator.command, path.resolve(rootDir, config.generator.cwd ?? ".")],
    ["preview.process.command", config.preview.command, path.resolve(rootDir, config.preview.cwd ?? ".")],
  ];
  for (const [id, command, cwd] of commandChecks) {
    const cwdKind = await pathKind(cwd);
    addCheck(checks, `${id}.cwd`, cwdKind === "directory" ? "pass" : "fail", cwdKind === "directory" ? "process cwd exists." : "process cwd must be a real directory.", `${cwd} is ${cwdKind}`);
    if (cwdKind !== "directory") blockingReasons.push(`${id} cwd is invalid`);
    if (options.probeCommands !== false && cwdKind === "directory") {
      const probe = await (dependencies.probeCommand ?? probeExecutableCommand)({ command, cwd });
      addCheck(checks, id, probe.ok ? "pass" : "fail", probe.ok ? "process command is resolvable without running the experiment." : "process command could not be resolved.", probe.detail);
      if (!probe.ok) blockingReasons.push(`${id} is not resolvable`);
    } else if (options.probeCommands === false) {
      addCheck(checks, id, "warning", "process command probe was skipped.");
      warnings.push(`${id} was not probed`);
    }
  }

  if (evaluationCase && config.run.variant !== "baseline_direct_prompt" && config.run.variant !== "agentforge_manifest") {
    blockingReasons.push("invalid run variant");
  }

  return ProductUIImplementationPreflightResultSchema.parse({
    schemaVersion: 1,
    type: "agentforge_product_ui_implementation_preflight",
    ready: blockingReasons.length === 0,
    packageDir,
    configPath,
    checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    checks,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: [...new Set(warnings)],
  });
}

function requiredFlag(name: string) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`PRODUCT_UI_PREFLIGHT_FLAG_MISSING:${name}`);
  return value;
}

async function main() {
  const packageDir = requiredFlag("--package-dir");
  const configPath = requiredFlag("--config");
  const skipCommandProbe = process.argv.includes("--skip-command-probe");
  const rawConfig = await readJson(path.resolve(configPath));
  const result = await runProductUIImplementationPreflight(rawConfig, {
    packageDir,
    configPath,
    probeCommands: !skipCommandProbe,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ready) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}