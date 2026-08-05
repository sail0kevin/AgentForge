import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ProductUIReportGroupSchema } from "../src/lib/report/contracts";
import {
  ProductUIAcceptanceProbeSchema,
  ProductUIImplementationEvaluationModelSchema,
} from "../src/lib/report/product-ui-implementation-evaluation";
import { buildProductUIImplementationExperimentPackage } from "../src/lib/report/product-ui-implementation-experiment-package";

const ArtifactPathsSchema = z.object({
  baseline_direct_prompt: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
  agentforge_manifest: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
});

export const ProductUIImplementationExperimentPackageExportInputSchema = z.object({
  studyId: z.string().min(1).max(160),
  caseId: z.string().min(1).max(160),
  reportGroup: ProductUIReportGroupSchema,
  solutionId: z.string().min(1).max(160),
  downstreamModel: ProductUIImplementationEvaluationModelSchema,
  acceptanceProbes: z.array(ProductUIAcceptanceProbeSchema).max(100).optional(),
  minimumCaseCount: z.number().int().min(1).max(500).optional(),
  minimumRaterCount: z.number().int().min(1).max(50).optional(),
  humanReviewRubricVersion: z.string().min(1).max(160),
  reviewArtifactPaths: ArtifactPathsSchema.optional(),
  generatedAt: z.string().datetime().optional(),
}).strict();

export type ProductUIImplementationExperimentPackageExportInput = z.infer<typeof ProductUIImplementationExperimentPackageExportInputSchema>;

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredFlag(name: string) {
  const value = flagValue(name);
  if (!value) throw new Error(`MISSING_REQUIRED_FLAG:${name}`);
  return value;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * 将实验包拆分为下游实施者、实验管理员和盲评者各自可消费的目录。
 * reviewer 目录不写入任何 variant 映射，避免把盲评身份泄露到评分材料。
 */
export async function exportProductUIImplementationExperimentPackage(
  rawInput: unknown,
  outputDir: string,
) {
  const input = ProductUIImplementationExperimentPackageExportInputSchema.parse(rawInput);
  const report = input.reportGroup.reports.find((item) => item.productUISpec?.solutionId === input.solutionId);
  if (!report) throw new Error("PRODUCT_UI_SOLUTION_NOT_FOUND");

  const experimentPackage = buildProductUIImplementationExperimentPackage({
    studyId: input.studyId,
    caseId: input.caseId,
    group: input.reportGroup,
    report,
    downstreamModel: input.downstreamModel,
    acceptanceProbes: input.acceptanceProbes,
    minimumCaseCount: input.minimumCaseCount,
    minimumRaterCount: input.minimumRaterCount,
    humanReviewRubricVersion: input.humanReviewRubricVersion,
    reviewArtifactPaths: input.reviewArtifactPaths,
    generatedAt: input.generatedAt,
  });

  const absoluteOutputDir = path.resolve(outputDir);
  const operatorDir = path.join(absoluteOutputDir, "operator");
  const adminDir = path.join(absoluteOutputDir, "admin");
  const reviewerDir = path.join(absoluteOutputDir, "reviewer");
  await Promise.all([mkdir(operatorDir, { recursive: true }), mkdir(adminDir, { recursive: true }), mkdir(reviewerDir, { recursive: true })]);

  await Promise.all([
    writeJson(path.join(absoluteOutputDir, "case.json"), experimentPackage.evaluationCase),
    writeFile(path.join(operatorDir, "baseline-direct-prompt.md"), experimentPackage.operatorHandoff.baseline.prompt, "utf8"),
    writeFile(path.join(operatorDir, "agentforge-manifest-prompt.md"), experimentPackage.operatorHandoff.agentforge.prompt, "utf8"),
    writeJson(path.join(operatorDir, "agentforge-report.json"), experimentPackage.operatorHandoff.agentforge.report),
    writeJson(path.join(operatorDir, "agentforge-manifest.json"), experimentPackage.operatorHandoff.agentforge.manifest),
    writeJson(path.join(adminDir, "blind-review-assignments.json"), experimentPackage.admin.blindReviewAssignments),
    writeJson(path.join(reviewerDir, "review-package.json"), experimentPackage.reviewer),
  ]);

  return {
    outputDir: absoluteOutputDir,
    studyId: experimentPackage.evaluationCase.studyId,
    caseId: experimentPackage.evaluationCase.caseId,
    baselinePromptSha256: experimentPackage.operatorHandoff.baseline.promptSha256,
    agentforgePromptSha256: experimentPackage.operatorHandoff.agentforge.promptSha256,
    reportSha256: experimentPackage.operatorHandoff.agentforge.reportSha256,
    manifestSha256: experimentPackage.operatorHandoff.agentforge.manifestSha256,
  };
}

async function main() {
  const inputPath = requiredFlag("--input");
  const outputDir = requiredFlag("--output");
  const rawInput = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  const result = await exportProductUIImplementationExperimentPackage(rawInput, outputDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}