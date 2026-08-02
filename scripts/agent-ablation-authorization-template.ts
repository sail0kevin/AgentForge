import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAblationExecutionAuthorizationTemplate } from "@/lib/review/ablation-authorization-template";
import { validateAblationRunPlan } from "@/lib/review/ablation-protocol";
import { isWithinLocalOnly } from "@/lib/review/ablation-authorization";

function value(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(flag: string) {
  const result = value(flag);
  if (!result) throw new Error(`ABLATION_AUTHORIZATION_TEMPLATE_FLAG_MISSING: ${flag}`);
  return result;
}

function optionalNumber(flag: string) {
  const raw = value(flag);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`ABLATION_AUTHORIZATION_TEMPLATE_NUMBER_INVALID: ${flag}`);
  return parsed;
}

async function main() {
  const planPath = path.resolve(required("--plan"));
  const outputPath = path.resolve(required("--output"));
  if (!isWithinLocalOnly(outputPath, process.cwd())) throw new Error("ABLATION_AUTHORIZATION_TEMPLATE_OUTPUT_MUST_BE_LOCAL_ONLY");
  if (!process.argv.includes("--force")) {
    try {
      await readFile(outputPath, "utf8");
      throw new Error("ABLATION_AUTHORIZATION_TEMPLATE_OUTPUT_EXISTS: use --force to replace it");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const plan = validateAblationRunPlan(JSON.parse(await readFile(planPath, "utf8")));
  const template = createAblationExecutionAuthorizationTemplate({
    plan,
    model: value("--model"),
    temperature: optionalNumber("--temperature"),
    plannerPromptVersion: value("--planner-prompt-version"),
    reviewPromptVersion: value("--review-prompt-version"),
    ragSnapshot: value("--rag-snapshot"),
    maxEstimatedInputTokensPerCall: optionalNumber("--max-estimated-input-tokens-per-call"),
    maxOutputTokensPerCall: optionalNumber("--max-output-tokens-per-call"),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: "template_created_pending_approval",
    outputPath,
    runPlanSha256: template.runPlanSha256,
    caseManifestSha256: template.caseManifestSha256,
    proposedProtocolReserveUsd: template.maxTotalCostUsd,
    limitation: "This file is not an approval and cannot pass execution authorization until a负责人 completes the fields, changes status to approved, and confirms the external-cost budget.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
