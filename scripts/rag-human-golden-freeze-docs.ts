import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkMarkdown, type Chunk } from "../src/lib/rag/chunker";
import type { HumanGoldenSourceManifestEntry } from "../src/lib/rag/human-golden-package";
import { HUMAN_GOLDEN_DOCUMENT_TYPES, type HumanGoldenDocumentType } from "../src/lib/rag/human-golden-set";
import { assertPathWithinLocalOnly } from "./local-only-path";

type FrozenDocument = {
  path: string;
  relativePath: string;
  content: string;
  sha256: string;
  version: string;
  documentType: HumanGoldenDocumentType;
};

const DEFAULT_OUTPUT = "local-only/rag-human-golden-docs-freeze";
const DEFAULT_DOCS = [
  "docs/2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md",
  "docs/2026-08-01 - current-development-status - 当前开发状态.md",
  "docs/2026-08-01 - current-runtime-architecture - 当前运行架构.md",
  "docs/2026-08-01 - v2-evidence-baseline - V2证据基线.md",
  "docs/2026-08-01 - v2-workflow-retrieval-data-architecture - V2工作流检索与数据关系.md",
  "docs/2026-08-02 - internal-pilot-delivery-plan - 内部试点交付计划.md",
  "docs/2026-08-02 - pilot-operations-runbook - 内部试点部署运维Runbook.md",
  "docs/2026-08-02 - api-reference - API接口参考.md",
];

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function values(name: string) {
  const result: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[index + 1]);
  }
  return result;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function assertPathWithinDocs(filePath: string) {
  const docsRoot = path.resolve("docs");
  const relativePath = path.relative(docsRoot, filePath);
  const isOutsideDocs = relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
  if (isOutsideDocs) throw new Error(`RAG_HUMAN_GOLDEN_FREEZE_DOC_OUTSIDE_DOCS: ${normalizeRelativePath(filePath)}`);
}

function slugify(value: string, fallbackHash: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `document-${fallbackHash.slice(0, 12)}`;
}

function uniqueSlug(baseSlug: string, digest: string, existing: Set<string>) {
  if (!existing.has(baseSlug)) {
    existing.add(baseSlug);
    return baseSlug;
  }
  const slug = `${baseSlug}-${digest.slice(0, 8)}`;
  if (existing.has(slug)) throw new Error(`RAG_HUMAN_GOLDEN_FREEZE_DOC_ID_DUPLICATE: ${slug}`);
  existing.add(slug);
  return slug;
}

function inferVersion(filePath: string) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const match = baseName.match(/^(\d{4}-\d{2}-\d{2})\s+-/);
  return match?.[1] ?? "old";
}

function inferDocumentType(filePath: string): HumanGoldenDocumentType {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  if (/(api|route|contract|接口|契约)/i.test(normalized)) return "api-reference";
  if (/(runbook|demo|部署|运维|演示|指南)/i.test(normalized)) return "runbook";
  if (/(policy|protocol|quality|gate|checklist|audit|security|评测|验收|门禁|协议|审计|安全)/i.test(normalized)) return "policy";
  if (/(architecture|runtime|rag|langgraph|checkpoint|remediation|design|工程|架构|设计|整改|运行|检索|数据库)/i.test(normalized)) return "technical";
  if (/(business|pilot|roadmap|status|report|plan|delivery|证据|试点|路线|计划|报告|状态|交付)/i.test(normalized)) return "business";
  return "other";
}

function extractTitle(content: string, filePath: string) {
  const heading = content.split("\n").find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim() || path.basename(filePath, path.extname(filePath));
}

async function readFrozenDocument(filePath: string, overrideVersion?: string): Promise<FrozenDocument> {
  const absolutePath = path.resolve(filePath);
  assertPathWithinDocs(absolutePath);
  if (path.extname(absolutePath).toLowerCase() !== ".md") {
    throw new Error(`RAG_HUMAN_GOLDEN_FREEZE_DOC_NOT_MARKDOWN: ${normalizeRelativePath(absolutePath)}`);
  }
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new Error(`RAG_HUMAN_GOLDEN_FREEZE_DOC_NOT_FILE: ${normalizeRelativePath(absolutePath)}`);
  const content = await readFile(absolutePath, "utf8");
  if (!content.trim()) throw new Error(`RAG_HUMAN_GOLDEN_FREEZE_DOC_EMPTY: ${normalizeRelativePath(absolutePath)}`);
  return {
    path: absolutePath,
    relativePath: normalizeRelativePath(absolutePath),
    content,
    sha256: sha256(content),
    version: overrideVersion ?? inferVersion(absolutePath),
    documentType: inferDocumentType(absolutePath),
  };
}

function buildSnapshot(documents: FrozenDocument[], license: string) {
  const usedSlugs = new Set<string>();
  const chunks: Chunk[] = [];
  const sources: HumanGoldenSourceManifestEntry[] = [];

  for (const document of documents) {
    const baseSlug = slugify(path.basename(document.path, path.extname(document.path)), document.sha256);
    const documentId = uniqueSlug(baseSlug, document.sha256, usedSlugs);
    const sourceId = `source-${documentId}`;
    sources.push({
      sourceId,
      documentId,
      documentType: document.documentType,
      version: document.version,
      contentSha256: document.sha256,
      license,
    });

    const documentChunks = chunkMarkdown(document.content, documentId).map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        sourcePath: document.relativePath,
        documentTitle: extractTitle(document.content, document.path),
      },
    }));
    chunks.push(...documentChunks);
  }

  if (!chunks.length) throw new Error("RAG_HUMAN_GOLDEN_FREEZE_DOCS_NO_CHUNKS");
  return { chunks, sources };
}

async function main() {
  const outputPath = path.resolve(option("--output") ?? DEFAULT_OUTPUT);
  const docPaths = values("--doc");
  const version = option("--version");
  const license = option("--license") ?? "project-internal";
  assertPathWithinLocalOnly(outputPath, "RAG_HUMAN_GOLDEN_FREEZE_DOCS_OUTPUT_MUST_BE_LOCAL_ONLY");
  if (!license.trim()) throw new Error("RAG_HUMAN_GOLDEN_FREEZE_DOCS_LICENSE_REQUIRED");

  const documentPaths = docPaths.length ? docPaths : DEFAULT_DOCS;
  const documents = await Promise.all(documentPaths.map((filePath) => readFrozenDocument(filePath, version)));
  const { chunks, sources } = buildSnapshot(documents, license);

  await mkdir(outputPath, { recursive: true });
  const corpusPath = path.join(outputPath, "corpus.json");
  const sourcesPath = path.join(outputPath, "sources.json");
  await writeFile(corpusPath, `${JSON.stringify(chunks, null, 2)}\n`, "utf8");
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

  // 这里刻意只冻结真实文档与 chunk 清单，不生成 query 或相关性标签。
  await writeFile(path.join(outputPath, "README.md"), [
    "# RAG human Golden Set frozen docs snapshot",
    "",
    "This directory contains a frozen document corpus for preparing a private human Golden Set annotation package.",
    "",
    "Generated files:",
    "- `corpus.json`: Markdown chunks derived from selected project docs.",
    "- `sources.json`: source manifest with document hashes, document type, version, and license.",
    "",
    "Next command:",
    `npm run quality:rag:human-golden:prepare -- --corpus ${normalizeRelativePath(corpusPath)} --sources ${normalizeRelativePath(sourcesPath)} --output local-only/rag-human-golden-annotation`,
    "",
    "Limitations:",
    "- This snapshot contains no human-written queries and no relevance labels.",
    "- It must not be described as Recall@5, MRR, NDCG, or production RAG quality evidence.",
    "",
  ].join("\n"), "utf8");

  console.log(JSON.stringify({
    status: "frozen",
    outputPath,
    sourceCount: sources.length,
    chunkCount: chunks.length,
    documentTypes: HUMAN_GOLDEN_DOCUMENT_TYPES.reduce<Record<HumanGoldenDocumentType, number>>((counts, documentType) => {
      counts[documentType] = sources.filter((source) => source.documentType === documentType).length;
      return counts;
    }, { technical: 0, business: 0, "api-reference": 0, runbook: 0, policy: 0, other: 0 }),
    corpusPath,
    sourcesPath,
    casesGenerated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
