import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { assertPathWithinLocalOnly } from "./local-only-path";
import { summarizePilotFeedback } from "../src/lib/pilot/feedback-summary";

function readArgument(name: string) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
}

async function main() {
  const outputPath = readArgument("--output");
  if (outputPath) assertPathWithinLocalOnly(outputPath, "PILOT_FEEDBACK_OUTPUT_OUTSIDE_LOCAL_ONLY");

  const records = await prisma.pilotFeedback.findMany({
    select: {
      reportUsability: true,
      humanEdited: true,
      interventionReason: true,
      evidenceIssueType: true,
      failureCategory: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const report = {
    reportType: "pilot-feedback-summary-v1",
    generatedAt: new Date().toISOString(),
    privacy: "仅包含匿名聚合计数、比例和时间窗口；不含工作流标识、需求、Prompt、原始模型输出、备注或凭证。",
    summary: summarizePilotFeedback(records),
  };
  const rendered = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    const absolutePath = path.resolve(outputPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, rendered, "utf8");
    console.log(`已写入匿名试点反馈汇总：${absolutePath}`);
  } else {
    console.log(rendered);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
