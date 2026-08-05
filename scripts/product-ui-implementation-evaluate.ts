import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { z } from "zod";
import {
  createProductUIImplementationRunMetadata,
  ProductUIAcceptanceProbeSchema,
  ProductUIImplementationEvaluationCaseSchema,
  validateProductUIClaudeGeneratorSummary,
  validateProductUIImplementationRun,
  type ProductUIAcceptanceProbe,
} from "../src/lib/report/product-ui-implementation-evaluation";
import {
  ProductUIImplementationVariantSchema,
  type ProductUIRuntimeEvidence,
} from "../src/lib/report/contracts";

const ViewportSchema = z.object({
  width: z.number().int().min(320).max(4_000),
  height: z.number().int().min(320).max(4_000),
});

export const ProductUIImplementationEvaluationRunnerConfigSchema = z.object({
  evaluationCase: ProductUIImplementationEvaluationCaseSchema,
  run: z.object({
    runId: z.string().trim().min(1).max(160),
    caseId: z.string().trim().min(1).max(160),
    variant: ProductUIImplementationVariantSchema,
    sourceRevision: z.string().trim().max(200).nullable().default(null),
    generatorOutputPaths: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
    previewOutputPaths: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
    orchestratorOutputPaths: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  }),
  previewUrl: z.string().url().max(1_000),
  launchCommand: z.string().trim().min(3).max(1_000),
  // 浏览器验收只接受已校验的生成器摘要，避免结果脱离实际生成条件。
  generatorSummaryPath: z.string().trim().min(1).max(1_000),
  outputDir: z.string().trim().min(1).max(1_000).default("artifacts/product-ui-implementation-evaluation"),
  headless: z.boolean().default(true),
  navigationTimeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  settleMs: z.number().int().min(0).max(10_000).default(250),
  desktopViewport: ViewportSchema.default({ width: 1440, height: 1000 }),
  mobileViewport: ViewportSchema.default({ width: 390, height: 844 }),
});

export type ProductUIImplementationEvaluationRunnerConfig = z.infer<typeof ProductUIImplementationEvaluationRunnerConfigSchema>;

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredFlag(name: string) {
  const value = flagValue(name);
  if (!value) throw new Error(`PRODUCT_UI_EVALUATION_FLAG_MISSING: ${name}`);
  return value;
}

function toRelativeArtifactPath(absolutePath: string) {
  return path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");
}

function routeUrl(previewUrl: string, route: string) {
  const base = new URL(previewUrl);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return new URL(normalizedRoute, base).toString();
}

export function buildNotVerifiedAcceptanceResults(
  expectedAcceptanceIds: string[],
): ProductUIRuntimeEvidence["acceptanceResults"] {
  return expectedAcceptanceIds.map((acceptanceId) => ({
    acceptanceId,
    status: "not_verified" as const,
    note: "No registered browser probe was available for this acceptance item; it remains unverified.",
    evidencePaths: [],
  }));
}

function ensureResult(
  results: Map<string, ProductUIRuntimeEvidence["acceptanceResults"][number]>,
  result: ProductUIRuntimeEvidence["acceptanceResults"][number],
) {
  // 一个稳定 ID 只保留一次结果，避免同一验收项在不同视口被重复计数。
  if (!results.has(result.acceptanceId)) results.set(result.acceptanceId, result);
}

function probeNote(probe: ProductUIAcceptanceProbe, detail: string) {
  return `${probe.acceptanceId} ${probe.kind}: ${detail}`.slice(0, 1_000);
}

async function runProbe(
  page: Page,
  probe: ProductUIAcceptanceProbe,
  screenshotPath: string | undefined,
  timeoutMs: number,
): Promise<ProductUIRuntimeEvidence["acceptanceResults"][number]> {
  const evidencePaths = screenshotPath ? [screenshotPath] : [];
  try {
    if (probe.kind === "route") {
      const status = await page.evaluate(() => document.readyState);
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const hasContent = bodyText.trim().length > 0 || await page.locator("body > *").count() > 0;
      const passed = hasContent && status !== "loading";
      return {
        acceptanceId: probe.acceptanceId,
        status: passed ? "passed" : "failed",
        note: probeNote(probe, passed ? "route loaded with non-empty document content" : "route loaded but the document appeared empty"),
        evidencePaths,
      };
    }

    if (probe.kind === "selector_visible") {
      const locator = page.locator(probe.selector!).first();
      const passed = await locator.isVisible({ timeout: timeoutMs });
      return {
        acceptanceId: probe.acceptanceId,
        status: passed ? "passed" : "failed",
        note: probeNote(probe, passed ? "selector is visible" : "selector is not visible"),
        evidencePaths,
      };
    }

    if (probe.kind === "selector_count") {
      const actualCount = await page.locator(probe.selector!).count();
      const passed = actualCount === probe.expectedCount;
      return {
        acceptanceId: probe.acceptanceId,
        status: passed ? "passed" : "failed",
        note: probeNote(probe, `expected count ${probe.expectedCount}, observed ${actualCount}`),
        evidencePaths,
      };
    }

    if (probe.kind === "click_then_visible") {
      await page.locator(probe.selector!).first().click({ timeout: timeoutMs });
      const target = page.locator(probe.targetSelector!).first();
      const passed = await target.isVisible({ timeout: timeoutMs });
      return {
        acceptanceId: probe.acceptanceId,
        status: passed ? "passed" : "failed",
        note: probeNote(probe, passed ? "click revealed the target selector" : "click did not reveal the target selector"),
        evidencePaths,
      };
    }

    if (probe.kind === "responsive_no_horizontal_overflow") {
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      const passed = dimensions.scrollWidth <= dimensions.clientWidth + 1;
      return {
        acceptanceId: probe.acceptanceId,
        status: passed ? "passed" : "failed",
        note: probeNote(probe, `client width ${dimensions.clientWidth}, scroll width ${dimensions.scrollWidth}`),
        evidencePaths,
      };
    }

    const language = await page.locator("html").getAttribute("lang");
    const passed = language === probe.expectedLanguage;
    return {
      acceptanceId: probe.acceptanceId,
      status: passed ? "passed" : "failed",
      note: probeNote(probe, `expected lang ${probe.expectedLanguage}, observed ${language ?? "missing"}`),
      evidencePaths,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      acceptanceId: probe.acceptanceId,
      status: "failed",
      note: probeNote(probe, `probe execution failed: ${message}`),
      evidencePaths,
    };
  }
}

async function navigateAndCapture(
  page: Page,
  config: ProductUIImplementationEvaluationRunnerConfig,
  route: string,
  viewportName: "desktop" | "mobile",
  viewport: { width: number; height: number },
  outputDir: string,
  screenshotPaths: string[],
  verificationNotes: string[],
) {
  await page.setViewportSize(viewport);
  const url = routeUrl(config.previewUrl, route);
  let responseStatus: number | null = null;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.navigationTimeoutMs,
    });
    responseStatus = response?.status() ?? null;
    if (config.settleMs > 0) await page.waitForTimeout(config.settleMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    verificationNotes.push(`${route} ${viewportName} navigation failed: ${message}`.slice(0, 1_000));
  }

  const fileName = `${viewportName}-${route.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root"}.png`;
  const absoluteScreenshotPath = path.join(outputDir, fileName);
  try {
    await page.screenshot({ path: absoluteScreenshotPath, fullPage: true });
    const relativePath = toRelativeArtifactPath(absoluteScreenshotPath);
    screenshotPaths.push(relativePath);
    verificationNotes.push(`${route} ${viewportName}: HTTP ${responseStatus ?? "no-response"}; screenshot saved.`);
    return { screenshotPath: relativePath, responseStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    verificationNotes.push(`${route} ${viewportName} screenshot failed: ${message}`.slice(0, 1_000));
    return { screenshotPath: undefined, responseStatus };
  }
}

export async function runProductUIImplementationEvaluation(
  rawConfig: unknown,
): Promise<{ evidence: ProductUIRuntimeEvidence; outputPath: string }> {
  const config = ProductUIImplementationEvaluationRunnerConfigSchema.parse(rawConfig);
  const evaluationCase = config.evaluationCase;
  const outputDir = path.resolve(config.outputDir);
  await mkdir(outputDir, { recursive: true });
  const generatorSummaryPath = path.resolve(config.generatorSummaryPath);
  // 在启动浏览器前绑定生成器摘要，任何模型、提示词或种子条件不一致都会阻断验收。
  const generatorSummary = validateProductUIClaudeGeneratorSummary(
    evaluationCase,
    JSON.parse(await readFile(generatorSummaryPath, "utf8")),
    { runId: config.run.runId, variant: config.run.variant },
  );
  const startedAt = new Date().toISOString();
  const screenshotPaths: string[] = [];
  const playwrightOutputPaths: string[] = [];
  const verificationNotes: string[] = [];
  const results = new Map<string, ProductUIRuntimeEvidence["acceptanceResults"][number]>();
  const probeByRoute = new Map<string, ProductUIAcceptanceProbe[]>();
  for (const rawProbe of evaluationCase.acceptanceProbes) {
    const probe = ProductUIAcceptanceProbeSchema.parse(rawProbe);
    const current = probeByRoute.get(probe.route) ?? [];
    current.push(probe);
    probeByRoute.set(probe.route, current);
  }

  const browser = await chromium.launch({ headless: config.headless });
  try {
    const page = await browser.newPage({ viewport: config.desktopViewport });
    for (const route of evaluationCase.routes) {
      const desktop = await navigateAndCapture(page, config, route, "desktop", config.desktopViewport, outputDir, screenshotPaths, verificationNotes);
      const mobile = await navigateAndCapture(page, config, route, "mobile", config.mobileViewport, outputDir, screenshotPaths, verificationNotes);
      for (const probe of probeByRoute.get(route) ?? []) {
        const viewport = probe.viewport ?? (probe.kind === "responsive_no_horizontal_overflow" ? config.mobileViewport : config.desktopViewport);
        const viewportName = viewport.width === config.mobileViewport.width && viewport.height === config.mobileViewport.height ? "mobile" : "desktop";
        await page.setViewportSize(viewport);
        let probeNavigationFailed = false;
        try {
          await page.goto(routeUrl(config.previewUrl, route), {
            waitUntil: "domcontentloaded",
            timeout: config.navigationTimeoutMs,
          });
          if (config.settleMs > 0) await page.waitForTimeout(config.settleMs);
        } catch (error) {
          probeNavigationFailed = true;
          const message = error instanceof Error ? error.message : String(error);
          verificationNotes.push(`${probe.acceptanceId} navigation failed: ${message}`.slice(0, 1_000));
        }
        const screenshotPath = viewportName === "mobile" ? mobile.screenshotPath : desktop.screenshotPath;
        ensureResult(results, probeNavigationFailed
          ? {
              acceptanceId: probe.acceptanceId,
              status: "failed",
              note: probeNote(probe, "route navigation failed before the probe could run"),
              evidencePaths: screenshotPath ? [screenshotPath] : [],
            }
          : await runProbe(page, probe, screenshotPath, config.navigationTimeoutMs));
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }

  for (const acceptanceId of evaluationCase.expectedAcceptanceIds) {
    if (!results.has(acceptanceId)) {
      ensureResult(results, buildNotVerifiedAcceptanceResults([acceptanceId])[0]!);
    }
  }

  const acceptanceResults = evaluationCase.expectedAcceptanceIds.map((acceptanceId) => results.get(acceptanceId)!);
  const completedAt = new Date().toISOString();
  if (screenshotPaths.length === 0) throw new Error("PRODUCT_UI_EVALUATION_SCREENSHOT_MISSING");
  const outputPath = path.join(outputDir, "runtime-evidence.json");
  playwrightOutputPaths.push(toRelativeArtifactPath(outputPath));
  const implementationRun = createProductUIImplementationRunMetadata(evaluationCase, {
    runId: config.run.runId,
    caseId: config.run.caseId,
    variant: config.run.variant,
    sourceRevision: config.run.sourceRevision,
    startedAt,
    completedAt,
    exitStatus: "completed",
    generatorOutputPaths: config.run.generatorOutputPaths,
    previewOutputPaths: config.run.previewOutputPaths,
    orchestratorOutputPaths: config.run.orchestratorOutputPaths,
    playwrightOutputPaths,
    executionEvidence: {
      provider: generatorSummary.execution.provider,
      model: generatorSummary.execution.model,
      promptVersion: generatorSummary.execution.promptVersion,
      parametersSha256: generatorSummary.execution.parametersSha256,
      adapterVersion: generatorSummary.execution.adapterVersion,
      seedSha256: generatorSummary.seed.sha256,
      generatorSummaryPath: toRelativeArtifactPath(generatorSummaryPath),
    },
  });
  const evidence = validateProductUIImplementationRun(evaluationCase, {
    launchCommand: config.launchCommand,
    previewUrl: config.previewUrl,
    screenshotPaths,
    verificationNotes: verificationNotes.length > 0 ? verificationNotes : ["Browser evaluation completed."],
    acceptanceResults,
    implementationRun,
  });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return { evidence, outputPath };
}

async function main() {
  const configPath = requiredFlag("--config");
  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8"));
  const result = await runProductUIImplementationEvaluation(config);
  console.log(JSON.stringify({
    outputPath: result.outputPath,
    runId: result.evidence.implementationRun?.runId,
    variant: result.evidence.implementationRun?.variant,
    acceptanceResults: result.evidence.acceptanceResults,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
