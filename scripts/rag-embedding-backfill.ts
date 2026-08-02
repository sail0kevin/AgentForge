import { prisma } from "../src/lib/db";
import { DEFAULT_EMBEDDING_MODEL } from "../src/lib/rag/embedding-client";
import { embeddingsEnabled, persistDocumentEmbeddings, selectChunksNeedingEmbeddings } from "../src/lib/rag/document-embeddings";

const BATCH_SIZE = 32;

function parseMetadata(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

/**
 * Opt-in maintenance command for documents uploaded before embeddings were enabled.
 * 默认只盘点，避免一次命令意外触发本地模型调用和数据库写入。
 */
async function main() {
  const execute = process.argv.includes("--execute");
  const model = process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL;
  const records = await prisma.documentChunk.findMany({
    select: {
      id: true,
      documentId: true,
      content: true,
      startLine: true,
      endLine: true,
      metadata: true,
      embedding: { select: { model: true, dimension: true, vectorJson: true } },
    },
    orderBy: { id: "asc" },
  });
  const candidates = selectChunksNeedingEmbeddings(records.map((record) => ({
    ...record,
    metadata: parseMetadata(record.metadata),
  })), model);

  if (!execute) {
    console.log(JSON.stringify({
      command: "rag-embedding-backfill",
      status: "preflight_only",
      model,
      totalChunks: records.length,
      chunksNeedingEmbeddings: candidates.length,
      requiredFlags: ["--execute"],
      limitation: "No embedding provider was called and no database row was written. Set RAG_EMBEDDINGS_ENABLED=true and pass --execute to run the backfill.",
    }, null, 2));
    return;
  }
  if (!embeddingsEnabled()) throw new Error("RAG_EMBEDDINGS_ENABLED_REQUIRED: set RAG_EMBEDDINGS_ENABLED=true before --execute");

  let completed = 0;
  let unavailableBatches = 0;
  for (let index = 0; index < candidates.length; index += BATCH_SIZE) {
    const batch = candidates.slice(index, index + BATCH_SIZE);
    const status = await persistDocumentEmbeddings(batch);
    if (status === "ready") completed += batch.length;
    else unavailableBatches += 1;
  }
  console.log(JSON.stringify({
    command: "rag-embedding-backfill",
    status: unavailableBatches === 0 ? "completed" : "partial",
    model,
    totalChunks: records.length,
    selectedChunks: candidates.length,
    embeddedChunks: completed,
    unavailableBatches,
    limitation: "This reports persistence activity only. It does not measure retrieval quality or prove a recall improvement.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
