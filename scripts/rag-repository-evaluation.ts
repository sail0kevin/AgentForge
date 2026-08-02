import { readFile } from "node:fs/promises";
import path from "node:path";
import { chunkMarkdown } from "../src/lib/rag/chunker";
import { retrieveChunks } from "../src/lib/rag/retrieval";

const corpusFiles = [
  "README.md",
<<<<<<< HEAD
  "docs/2026-08-01 - current-development-status - 当前开发状态.md",
=======
  "docs/current-status - 当前开发状态.md",
>>>>>>> origin/agent/agentforge-publish-2026-07-20
];

const cases = [
  { id: "workflow-recovery", query: "中断 刷新 人工 等待 幂等 Checkpoint", heading: "可恢复执行" },
  { id: "audit-cost", query: "系统 记录 Token 费用 Provider ToolInvocation", heading: "可审计与成本可见" },
  { id: "data-isolation", query: "API Key 服务端 加密 用户 Session 隔离", heading: "凭证与数据隔离" },
  { id: "candidate-review", query: "Delivery Quality 独立 Candidate Reviewer Finding 交叉评审", heading: "结构化候选与交叉评审" },
  { id: "quality-gate", query: "Unit Core Playwright E2E Session isolation TypeScript ESLint Build", heading: "可复现的质量证据" },
  { id: "known-limitations", query: "真实模型盲评 尚未完成 质量结论", heading: "当前边界" },
] as const;

async function loadCorpus() {
  const chunks = [];
  for (const relativePath of corpusFiles) {
    const absolutePath = path.resolve(relativePath);
    const content = await readFile(absolutePath, "utf8");
    chunks.push(...chunkMarkdown(content, relativePath));
  }
  return chunks;
}

async function main() {
  const chunks = await loadCorpus();
  const results = cases.map((testCase) => {
    const retrieved = retrieveChunks(testCase.query, chunks, 5);
    const matched = retrieved.some((chunk) => `${chunk.metadata.headingPath ?? ""} ${chunk.content}`.includes(testCase.heading));
    return {
      id: testCase.id,
      matched,
      topHeading: retrieved[0]?.metadata.headingPath ?? null,
      retrievedCount: retrieved.length,
    };
  });

  const passed = results.filter((result) => result.matched).length;
  console.log(JSON.stringify({
    dataset: "agentforge-repository-docs",
    files: corpusFiles,
    chunkCount: chunks.length,
    caseCount: cases.length,
    passed,
    results,
    limitation: "Repository-document retrieval smoke test; it is not a real-model semantic quality claim.",
  }, null, 2));

  if (passed !== cases.length) {
    throw new Error(`Repository retrieval gate failed: ${passed}/${cases.length} cases matched their target sections.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
