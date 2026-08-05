/**
 * 为 P4a 生成一个最小可跑的 ProductUIReportGroup + 实验包。
 * 不走 API / 不走 e2e，直接用 library 函数落库到 dev.db。
 * 用于验证"链路通"，不用于证明效力。
 */

import { prisma } from "../src/lib/db";
import { createProductUIReportGroup } from "../src/lib/report/product-ui-report";
import { saveProductUIReportGroup } from "../src/lib/report/product-ui-group-service";
import { buildProductUIImplementationExperimentPackage } from "../src/lib/report/product-ui-implementation-experiment-package";
import { writeFile } from "node:fs/promises";

async function main() {
  const userId = "seed-user";
  const reviewWorkflowId = `seed-review-${Date.now()}`;
  const groupId = `product-ui-group:seed-workflow:1`;

  // 最小可跑的 source：createProductUIReportGroup 只需要 reviewWorkflowId + requirement
  const source = {
    reviewWorkflowId,
    requirement: "为运营团队建设内容管理后台，需要角色权限、审核流程、操作审计和分阶段验收。",
    analysis: { schemaVersion: 1, missingInformation: [], projectType: "web-app" },
    plan: { schemaVersion: 1, tasks: [], reportSections: [] },
  } as unknown as Parameters<typeof createProductUIReportGroup>[0];

  const group = createProductUIReportGroup(source, { groupId });
  const saved = await saveProductUIReportGroup({ userId, reviewWorkflowId, group });
  console.log("Saved report group:", saved.record.id, "status:", saved.record.status);

  // 导出实验包
  const report = saved.record.reports[0];
  if (!report?.productUISpec) throw new Error("No productUI spec in report");

  const experimentPackage = buildProductUIImplementationExperimentPackage({
    studyId: "seed-study",
    caseId: "seed-case-001",
    group: saved.record,
    report,
    downstreamModel: { provider: "anthropic", model: "sonnet", promptVersion: "v1", adapterVersion: "v1", parameters: {} },
    humanReviewRubricVersion: "product-ui-blind-rubric-v1",
  });

  const outPath = "artifacts/product-ui-experiments/seed-study/seed-case-001/experiment-package.json";
  await writeFile(outPath, JSON.stringify(experimentPackage, null, 2) + "\n", "utf8");
  console.log("Experiment package written to:", outPath);
  console.log("Solution ID:", report.productUISpec.solutionId);
  console.log("Baseline prompt hash:", experimentPackage.operatorHandoff.baseline.promptSha256.slice(0, 16) + "...");
  console.log("AgentForge prompt hash:", experimentPackage.operatorHandoff.agentforge.promptSha256.slice(0, 16) + "...");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
