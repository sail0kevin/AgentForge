import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isWithinLocalOnly } from "@/lib/review/ablation-authorization";
import { createAblationRunPlan } from "@/lib/review/ablation-protocol";
import { hashAblationJson } from "@/lib/review/ablation-results";
import { validateLightweightCaseManifest } from "@/lib/review/lightweight-case-manifest";

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const manifestPath = path.resolve(flagValue("--manifest") ?? "docs/quality - 质量评测/lightweight-case-manifest.json");
  const trialCount = Number.parseInt(flagValue("--trials") ?? "5", 10);
  const executionOrderSeed = Number.parseInt(flagValue("--execution-order-seed") ?? "20260801", 10);
  const outputPath = flagValue("--output");
  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > 100) {
    throw new Error("ABLATION_TRIAL_COUNT_INVALID: --trials must be an integer between 1 and 100");
  }
  if (!Number.isInteger(executionOrderSeed) || executionOrderSeed < 0) {
    throw new Error("ABLATION_EXECUTION_ORDER_SEED_INVALID: --execution-order-seed must be a non-negative integer");
  }

  const manifest = validateLightweightCaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const plan = createAblationRunPlan(manifest, trialCount, executionOrderSeed);
  const output = JSON.stringify(plan, null, 2);
  // 授权校验按解析后的规范 JSON 计算哈希，避免换行或缩进差异误伤同一份冻结计划。
  const fingerprints = {
    caseManifestSha256: plan.caseManifestSha256,
    runPlanSha256: hashAblationJson(plan),
  };
  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    // 冻结计划与后续授权、台账共同构成真实评测审计链，只能写入 Git 忽略的私有目录。
    if (!isWithinLocalOnly(resolvedOutputPath, process.cwd())) {
      throw new Error("ABLATION_PLAN_OUTPUT_MUST_BE_LOCAL_ONLY");
    }
    // 本地私有结果目录可能尚未存在；创建父目录不改变冻结计划的内容或哈希。
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, `${output}\n`, "utf8");
    console.error(JSON.stringify({
      status: "frozen",
      plannedRunCount: plan.runs.length,
      outputPath: resolvedOutputPath,
      fingerprints,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ plan, fingerprints }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
