import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import {
  ProductUIImplementationEvaluationCaseSchema,
  validateProductUIClaudeGeneratorSummary,
  type ProductUIImplementationEvaluationCase,
} from "../src/lib/report/product-ui-implementation-evaluation";
import { ProductUIImplementationVariantSchema } from "../src/lib/report/contracts";
import {
  runProductUIImplementationEvaluation,
  type ProductUIImplementationEvaluationRunnerConfig,
} from "./product-ui-implementation-evaluate";

const ProcessCommandSchema = z.object({
  command: z.string().trim().min(1).max(1_000),
  args: z.array(z.string().max(4_000)).max(120).default([]),
  cwd: z.string().trim().min(1).max(1_000).optional(),
  timeoutMs: z.number().int().min(1_000).max(3_600_000).default(900_000),
}).strict();

const PreviewCommandSchema = ProcessCommandSchema.extend({
  previewUrl: z.string().url().max(1_000),
  readyTimeoutMs: z.number().int().min(1_000).max(300_000).default(60_000),
  pollIntervalMs: z.number().int().min(100).max(10_000).default(500),
}).strict();

const ViewportSchema = z.object({
  width: z.number().int().min(320).max(4_000),
  height: z.number().int().min(320).max(4_000),
});

export const ProductUIImplementationOrchestratorConfigSchema = z.object({
  packageDir: z.string().trim().min(1).max(1_000),
  outputDir: z.string().trim().min(1).max(1_000).default("artifacts/product-ui-implementation-runs"),
  run: z.object({
    runId: z.string().trim().min(1).max(160),
    variant: ProductUIImplementationVariantSchema,
    sourceRevision: z.string().trim().max(200).nullable().default(null),
  }).strict(),
  generator: ProcessCommandSchema,
  preview: PreviewCommandSchema,
  evaluator: z.object({
    headless: z.boolean().default(true),
    navigationTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
    settleMs: z.number().int().min(0).max(10_000).default(250),
    desktopViewport: ViewportSchema.default({ width: 1440, height: 1000 }),
    mobileViewport: ViewportSchema.default({ width: 390, height: 844 }),
  }).strict().default({
    headless: true,
    navigationTimeoutMs: 30_000,
    settleMs: 250,
    desktopViewport: { width: 1440, height: 1000 },
    mobileViewport: { width: 390, height: 844 },
  }),
}).strict();

export type ProductUIImplementationOrchestratorConfig = z.infer<typeof ProductUIImplementationOrchestratorConfigSchema>;

export interface ProductUIProcessResult {
  startedAt: string;
  completedAt: string;
  exitStatus: "completed" | "failed" | "timeout" | "cancelled";
  exitCode: number | null;
  signal: string | null;
  stdoutPath: string;
  stderrPath: string;
  error: string | null;
}

export interface ProductUIRunningProcess {
  result: Promise<ProductUIProcessResult>;
  stop: () => void;
}

export interface ProductUIImplementationOrchestrationResult {
  status: "completed" | "generator_failed" | "preview_failed" | "evaluation_failed";
  runId: string;
  variant: "baseline_direct_prompt" | "agentforge_manifest";
  outputDir: string;
  summaryPath: string;
  generator: ProductUIProcessResult;
  preview: ProductUIProcessResult | null;
  runtimeEvidencePath: string | null;
  failure: string | null;
}

export interface ProductUIImplementationOrchestrationDependencies {
  runCommand?: (input: {
    command: z.infer<typeof ProcessCommandSchema>;
    environment: NodeJS.ProcessEnv;
    stdoutPath: string;
    stderrPath: string;
  }) => Promise<ProductUIProcessResult>;
  startPreview?: (input: {
    command: z.infer<typeof PreviewCommandSchema>;
    environment: NodeJS.ProcessEnv;
    stdoutPath: string;
    stderrPath: string;
  }) => ProductUIRunningProcess;
  waitForPreview?: (input: {
    previewUrl: string;
    readyTimeoutMs: number;
    pollIntervalMs: number;
  }) => Promise<{ ready: boolean; detail: string }>;
  runEvaluation?: (config: ProductUIImplementationEvaluationRunnerConfig) => Promise<{ evidence: unknown; outputPath: string }>;
}

function requiredFlag(name: string) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`PRODUCT_UI_ORCHESTRATOR_FLAG_MISSING: ${name}`);
  return value;
}

function relativeArtifactPath(absolutePath: string) {
  return path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
}

function displayCommand(command: z.infer<typeof ProcessCommandSchema>) {
  return [command.command, ...command.args].map((value) => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
}

function resolveCommandCwd(command: z.infer<typeof ProcessCommandSchema>) {
  return path.resolve(command.cwd ?? process.cwd());
}

function logFilePaths(outputDir: string, processName: "generator" | "preview") {
  return {
    stdoutPath: path.join(outputDir, `${processName}.stdout.log`),
    stderrPath: path.join(outputDir, `${processName}.stderr.log`),
  };
}

async function endLogStream(stream: ReturnType<typeof createWriteStream>) {
  if (stream.writableFinished || stream.destroyed) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stream.once("finish", finish);
    stream.once("close", finish);
    stream.once("error", finish);
    stream.end();
  });
}

/**
 * 以 command + args 启动子进程，避免把外部配置拼接成 shell 字符串。
 * 标准输出和错误输出只写入 Artifact，不回显到控制台，避免无意输出下游工具的敏感信息。
 */
export function startProductUIImplementationProcess(input: {
  command: z.infer<typeof ProcessCommandSchema>;
  environment: NodeJS.ProcessEnv;
  stdoutPath: string;
  stderrPath: string;
}): ProductUIRunningProcess {
  const startedAt = new Date().toISOString();
  const stdout = createWriteStream(input.stdoutPath, { flags: "w" });
  const stderr = createWriteStream(input.stderrPath, { flags: "w" });
  let child: ChildProcess | null = null;
  let timedOut = false;
  let cancelled = false;
  let spawnError: string | null = null;
  let timer: NodeJS.Timeout | undefined;

  const result = new Promise<ProductUIProcessResult>((resolve) => {
    try {
      child = spawn(input.command.command, input.command.args, {
        cwd: resolveCommandCwd(input.command),
        env: input.environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      spawnError = error instanceof Error ? error.message : String(error);
    }

    if (!child) {
      void Promise.all([endLogStream(stdout), endLogStream(stderr)]).then(() => {
        resolve({
          startedAt,
          completedAt: new Date().toISOString(),
          exitStatus: "failed",
          exitCode: null,
          signal: null,
          stdoutPath: input.stdoutPath,
          stderrPath: input.stderrPath,
          error: spawnError ?? "PROCESS_START_FAILED",
        });
      });
      return;
    }

    child.stdout?.pipe(stdout);
    child.stderr?.pipe(stderr);
    child.once("error", (error) => {
      spawnError = error.message;
    });
    timer = setTimeout(() => {
      timedOut = true;
      child?.kill();
    }, input.command.timeoutMs);
    child.once("close", (exitCode, signal) => {
      if (timer) clearTimeout(timer);
      void Promise.all([endLogStream(stdout), endLogStream(stderr)]).then(() => {
        resolve({
          startedAt,
          completedAt: new Date().toISOString(),
          exitStatus: timedOut ? "timeout" : cancelled ? "cancelled" : spawnError || exitCode !== 0 ? "failed" : "completed",
          exitCode,
          signal,
          stdoutPath: input.stdoutPath,
          stderrPath: input.stderrPath,
          error: spawnError,
        });
      });
    });
  });

  return {
    result,
    stop: () => {
      if (child && !child.killed) {
        cancelled = true;
        child.kill();
      }
    },
  };
}

export async function runProductUIImplementationProcess(input: Parameters<typeof startProductUIImplementationProcess>[0]) {
  return startProductUIImplementationProcess(input).result;
}

export async function waitForProductUIPreview(input: {
  previewUrl: string;
  readyTimeoutMs: number;
  pollIntervalMs: number;
}) {
  const deadline = Date.now() + input.readyTimeoutMs;
  let detail = "preview did not respond";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(input.previewUrl, { signal: AbortSignal.timeout(Math.min(5_000, input.pollIntervalMs + 4_000)) });
      if (response.status < 500) return { ready: true, detail: `preview responded with HTTP ${response.status}` };
      detail = `preview responded with HTTP ${response.status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
  return { ready: false, detail };
}

/**
 * 只向下游生成器提供当前分支所需的输入路径。
 * Baseline 不会收到报告和 Manifest 路径，从运行环境层面防止对照分支泄漏 AgentForge 材料。
 */
export function buildProductUIImplementationBranchEnvironment(input: {
  executionInputDir: string;
  evaluationCase: ProductUIImplementationEvaluationCase;
  runId: string;
  variant: "baseline_direct_prompt" | "agentforge_manifest";
  outputDir: string;
  projectDir: string;
}) {
  const environment: Record<string, string> = {
    AGENTFORGE_EXECUTION_INPUT_DIR: input.executionInputDir,
    AGENTFORGE_CASE_PATH: path.join(input.executionInputDir, "case.json"),
    AGENTFORGE_RUN_ID: input.runId,
    AGENTFORGE_VARIANT: input.variant,
    AGENTFORGE_ARTIFACT_DIR: input.outputDir,
    // 生成器与预览进程共享本次运行的隔离目录，避免跨运行或跨分支写入。
    AGENTFORGE_IMPLEMENTATION_PROJECT_DIR: input.projectDir,
    AGENTFORGE_PROMPT_PATH: path.join(
      input.executionInputDir,
      input.variant === "baseline_direct_prompt" ? "baseline-direct-prompt.md" : "agentforge-manifest-prompt.md",
    ),
  };
  if (input.variant === "agentforge_manifest") {
    environment.AGENTFORGE_REPORT_PATH = path.join(input.executionInputDir, "agentforge-report.json");
    environment.AGENTFORGE_MANIFEST_PATH = path.join(input.executionInputDir, "agentforge-manifest.json");
  }
  return environment;
}

function composeProcessEnvironment(branchEnvironment: Record<string, string>) {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  // 清空继承环境中可能残留的分支路径，再写入本次运行的最小输入集。
  for (const key of [
    "AGENTFORGE_EXPERIMENT_PACKAGE_DIR",
    "AGENTFORGE_EXECUTION_INPUT_DIR",
    "AGENTFORGE_CASE_PATH",
    "AGENTFORGE_RUN_ID",
    "AGENTFORGE_VARIANT",
    "AGENTFORGE_ARTIFACT_DIR",
    "AGENTFORGE_IMPLEMENTATION_PROJECT_DIR",
    "AGENTFORGE_PROMPT_PATH",
    "AGENTFORGE_REPORT_PATH",
    "AGENTFORGE_MANIFEST_PATH",
  ]) {
    delete environment[key];
  }
  return { ...environment, ...branchEnvironment };
}

async function createExecutionInputSnapshot(input: {
  packageDir: string;
  executionInputDir: string;
  variant: "baseline_direct_prompt" | "agentforge_manifest";
}) {
  await mkdir(input.executionInputDir);
  const promptName = input.variant === "baseline_direct_prompt"
    ? "baseline-direct-prompt.md"
    : "agentforge-manifest-prompt.md";
  await Promise.all([
    copyFile(path.join(input.packageDir, "case.json"), path.join(input.executionInputDir, "case.json")),
    copyFile(path.join(input.packageDir, "operator", promptName), path.join(input.executionInputDir, promptName)),
  ]);
  if (input.variant === "agentforge_manifest") {
    await Promise.all([
      copyFile(path.join(input.packageDir, "operator", "agentforge-report.json"), path.join(input.executionInputDir, "agentforge-report.json")),
      copyFile(path.join(input.packageDir, "operator", "agentforge-manifest.json"), path.join(input.executionInputDir, "agentforge-manifest.json")),
    ]);
  }
}

async function createFreshRunDirectory(outputDir: string) {
  await mkdir(path.dirname(outputDir), { recursive: true });
  try {
    await mkdir(outputDir);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(`PRODUCT_UI_ORCHESTRATOR_RUN_DIRECTORY_EXISTS: ${outputDir}`);
    }
    throw error;
  }
}
async function writeSummary(summaryPath: string, result: ProductUIImplementationOrchestrationResult) {
  await writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export async function orchestrateProductUIImplementation(
  rawConfig: unknown,
  dependencies: ProductUIImplementationOrchestrationDependencies = {},
): Promise<ProductUIImplementationOrchestrationResult> {
  const config = ProductUIImplementationOrchestratorConfigSchema.parse(rawConfig);
  const packageDir = path.resolve(config.packageDir);
  const outputDir = path.resolve(config.outputDir, config.run.runId);
  const implementationProjectDir = path.join(outputDir, "generated-project");
  await createFreshRunDirectory(outputDir);
  const executionInputDir = path.join(outputDir, "execution-input");
  await createExecutionInputSnapshot({ packageDir, executionInputDir, variant: config.run.variant });
  const summaryPath = path.join(outputDir, "orchestration-summary.json");
  const evaluationCase = ProductUIImplementationEvaluationCaseSchema.parse(JSON.parse(await readFile(path.join(packageDir, "case.json"), "utf8")));
  if (!evaluationCase.variants.some((item) => item.variant === config.run.variant)) {
    throw new Error(`PRODUCT_UI_ORCHESTRATOR_VARIANT_NOT_REGISTERED: ${config.run.variant}`);
  }

  const branchEnvironment = buildProductUIImplementationBranchEnvironment({
    executionInputDir,
    evaluationCase,
    runId: config.run.runId,
    variant: config.run.variant,
    outputDir,
    projectDir: implementationProjectDir,
  });
  const environment = composeProcessEnvironment(branchEnvironment);
  const generatorLogs = logFilePaths(outputDir, "generator");
  const previewLogs = logFilePaths(outputDir, "preview");
  const runCommand = dependencies.runCommand ?? runProductUIImplementationProcess;
  const startPreview = dependencies.startPreview ?? startProductUIImplementationProcess;
  const waitForPreview = dependencies.waitForPreview ?? waitForProductUIPreview;
  const runEvaluation = dependencies.runEvaluation ?? runProductUIImplementationEvaluation;
  const generator = await runCommand({ command: config.generator, environment, ...generatorLogs });

  const base = {
    runId: config.run.runId,
    variant: config.run.variant,
    outputDir,
    summaryPath,
    generator,
  } as const;
  if (generator.exitStatus !== "completed") {
    const result: ProductUIImplementationOrchestrationResult = {
      ...base,
      status: "generator_failed",
      preview: null,
      runtimeEvidencePath: null,
      failure: `Generator exited with ${generator.exitStatus}.`,
    };
    await writeSummary(summaryPath, result);
    return result;
  }

  const generatorSummaryPath = path.join(outputDir, "claude-generator-summary.json");
  try {
    // 生成进程退出成功并不代表条件可复核；摘要缺失或不一致时禁止继续预览与浏览器验收。
    validateProductUIClaudeGeneratorSummary(
      evaluationCase,
      JSON.parse(await readFile(generatorSummaryPath, "utf8")),
      { runId: config.run.runId, variant: config.run.variant },
    );
  } catch (error) {
    const result: ProductUIImplementationOrchestrationResult = {
      ...base,
      status: "evaluation_failed",
      preview: null,
      runtimeEvidencePath: null,
      failure: error instanceof Error ? error.message : String(error),
    };
    await writeSummary(summaryPath, result);
    return result;
  }

  // 预览必须指向本次运行的生成目录，避免误启动仓库根目录或上一轮实验留下的页面。
  const preview = startPreview({
    command: { ...config.preview, cwd: implementationProjectDir },
    environment,
    ...previewLogs,
  });
  const previewReady = await waitForPreview(config.preview);
  if (!previewReady.ready) {
    preview.stop();
    const previewResult = await preview.result;
    const result: ProductUIImplementationOrchestrationResult = {
      ...base,
      status: "preview_failed",
      preview: previewResult,
      runtimeEvidencePath: null,
      failure: `Preview was not ready: ${previewReady.detail}`,
    };
    await writeSummary(summaryPath, result);
    return result;
  }

  try {
    const evaluation = await runEvaluation({
      evaluationCase,
      run: {
        runId: config.run.runId,
        caseId: evaluationCase.caseId,
        variant: config.run.variant,
        sourceRevision: config.run.sourceRevision,
        generatorOutputPaths: [
          relativeArtifactPath(generatorLogs.stdoutPath),
          relativeArtifactPath(generatorLogs.stderrPath),
          relativeArtifactPath(generatorSummaryPath),
        ],
        previewOutputPaths: [relativeArtifactPath(previewLogs.stdoutPath), relativeArtifactPath(previewLogs.stderrPath)],
        orchestratorOutputPaths: [relativeArtifactPath(summaryPath)],
      },
      previewUrl: config.preview.previewUrl,
      launchCommand: displayCommand(config.preview),
      generatorSummaryPath,
      outputDir: path.join(outputDir, "playwright"),
      ...config.evaluator,
    });
    preview.stop();
    const previewResult = await preview.result;
    const result: ProductUIImplementationOrchestrationResult = {
      ...base,
      status: "completed",
      preview: previewResult,
      runtimeEvidencePath: evaluation.outputPath,
      failure: null,
    };
    await writeSummary(summaryPath, result);
    return result;
  } catch (error) {
    preview.stop();
    const previewResult = await preview.result;
    const result: ProductUIImplementationOrchestrationResult = {
      ...base,
      status: "evaluation_failed",
      preview: previewResult,
      runtimeEvidencePath: null,
      failure: error instanceof Error ? error.message : String(error),
    };
    await writeSummary(summaryPath, result);
    return result;
  }
}

async function main() {
  const configPath = requiredFlag("--config");
  const rawConfig = JSON.parse(await readFile(path.resolve(configPath), "utf8"));
  const result = await orchestrateProductUIImplementation(rawConfig);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "completed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}