import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { humanGoldenAnnotationTemplate } from "../src/lib/rag/human-golden-import";
import { assertPathWithinLocalOnly } from "./local-only-path";

const output = process.argv[2];

async function main() {
  if (!output) throw new Error("RAG_HUMAN_GOLDEN_TEMPLATE_OUTPUT_REQUIRED: pass a local-only output directory");
  const outputPath = path.resolve(output);
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_TEMPLATE_OUTPUT_MUST_BE_LOCAL_ONLY");
  await mkdir(outputPath, { recursive: true });
  await Promise.all(Object.entries(humanGoldenAnnotationTemplate).map(([fileName, content]) => writeFile(path.join(outputPath, fileName), content, "utf8")));
  await writeFile(path.join(outputPath, "README.md"), [
    "# 人工 RAG Golden Set 标注包",
    "",
    "1. 填写 sources.tsv、chunks.tsv、cases.tsv；不要提交该目录。",
    "2. contentSha256 为原始文档或 chunk 的 SHA-256；cases.tsv 的 relevantChunksJson 必须是 JSON 数组。",
    "3. 每个 case 的 annotatedBy 与 reviewedBy 必须不同，reviewStatus 必须为 approved。",
    "4. 填写完成后用 quality:rag:human-golden:build 编译并校验。",
    "",
  ].join("\n"), "utf8");
  console.log(`Created human Golden Set annotation template at ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
