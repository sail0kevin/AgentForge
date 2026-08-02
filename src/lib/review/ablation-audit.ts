import { createHash } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";
import type { AblationResultLedger } from "./ablation-results";

export type AblationRawOutputAudit = {
  verifiedCompletedRunCount: number;
};

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function isWithinRoot(rootPath: string, candidatePath: string) {
  const relative = path.relative(rootPath, candidatePath);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

/**
 * 审计已完成运行的私有原始输出。realpath 校验会阻止看似位于目录内、实际借助符号链接逃逸的路径。
 * 排除项没有方案正文，因此不要求也不允许提供原始输出文件。
 */
export async function verifyAblationRawOutputs(ledger: AblationResultLedger): Promise<AblationRawOutputAudit> {
  let rootPath: string;
  try {
    rootPath = await realpath(path.resolve(ledger.metadata.rawOutputRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("ABLATION_RAW_OUTPUT_ROOT_MISSING");
    throw error;
  }

  let verifiedCompletedRunCount = 0;
  for (const result of ledger.results) {
    if (result.status !== "completed") continue;
    if (!result.rawOutputPath || !result.outputSha256) throw new Error("ABLATION_COMPLETED_RESULT_INCOMPLETE");
    const declaredPath = path.resolve(result.rawOutputPath);
    if (!isWithinRoot(rootPath, declaredPath)) throw new Error("ABLATION_RAW_OUTPUT_PATH_OUTSIDE_ROOT");

    let outputPath: string;
    try {
      outputPath = await realpath(declaredPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("ABLATION_RAW_OUTPUT_MISSING");
      throw error;
    }
    if (!isWithinRoot(rootPath, outputPath)) throw new Error("ABLATION_RAW_OUTPUT_PATH_OUTSIDE_ROOT");
    const content = await readFile(outputPath, "utf8");
    if (sha256(content) !== result.outputSha256) throw new Error("ABLATION_RAW_OUTPUT_HASH_MISMATCH");
    verifiedCompletedRunCount += 1;
  }
  return { verifiedCompletedRunCount };
}
