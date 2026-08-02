import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assessHumanGoldenSetReadiness, hashHumanGoldenSet, validateHumanGoldenSet, type HumanGoldenSet } from "../src/lib/rag/human-golden-set";
import { evaluateGradedRetrieval, hashRetrievalCorpus, type GradedRetrievalFixture } from "../src/lib/rag/graded-evaluation";
import { retrieveChunks, type RetrievedChunk } from "../src/lib/rag/retrieval";
import { retrieveByEmbedding, type EmbeddedChunk } from "../src/lib/rag/embedding-retrieval";
import { reciprocalRankFusion } from "../src/lib/rag/rrf";
import { selectRrfTuningCandidate } from "../src/lib/rag/rrf-tuning";
import { embedTexts, DEFAULT_EMBEDDING_MODEL } from "../src/lib/rag/embedding-client";
import type { Chunk } from "../src/lib/rag/chunker";

type Strategy = "tfidf" | "embedding" | "hybrid";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`RAG_HUMAN_GOLDEN_COMPARISON_FLAG_REQUIRED: ${name}`);
  return value;
}

function strategies(): Strategy[] {
  const value = option("--strategies") ?? "tfidf";
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!parsed.length || !parsed.every((item): item is Strategy => ["tfidf", "embedding", "hybrid"].includes(item))) {
    throw new Error("RAG_HUMAN_GOLDEN_COMPARISON_STRATEGY_INVALID: use tfidf, embedding, hybrid");
  }
  return [...new Set(parsed)];
}

function positiveInteger(name: string, fallback: number) {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`RAG_HUMAN_GOLDEN_COMPARISON_NUMBER_INVALID: ${name}`);
  return parsed;
}

function rrfKValues() {
  const value = option("--rrf-k-values");
  if (!value) return [positiveInteger("--rrf-k", 60)];
  const values = value.split(",").map((item) => Number(item.trim()));
  if (!values.length || values.some((item) => !Number.isInteger(item) || item < 1)) {
    throw new Error("RAG_HUMAN_GOLDEN_COMPARISON_RRF_K_VALUES_INVALID");
  }
  if (new Set(values).size !== values.length) throw new Error("RAG_HUMAN_GOLDEN_COMPARISON_RRF_K_VALUES_DUPLICATE");
  return values;
}

function assertCorpusMatchesDataset(dataset: HumanGoldenSet, chunks: Chunk[]) {
  const expected = new Map(dataset.chunks.map((chunk) => [chunk.chunkId, chunk]));
  if (chunks.length !== expected.size) throw new Error("RAG_HUMAN_GOLDEN_CORPUS_CHUNK_COUNT_MISMATCH");
  for (const chunk of chunks) {
    const labelled = expected.get(chunk.id);
    if (!labelled) throw new Error(`RAG_HUMAN_GOLDEN_CORPUS_CHUNK_UNKNOWN: ${chunk.id}`);
    const contentSha256 = createHash("sha256").update(chunk.content).digest("hex");
    if (contentSha256 !== labelled.contentSha256) throw new Error(`RAG_HUMAN_GOLDEN_CORPUS_CONTENT_HASH_MISMATCH: ${chunk.id}`);
    if (chunk.documentId !== labelled.documentId) throw new Error(`RAG_HUMAN_GOLDEN_CORPUS_DOCUMENT_MISMATCH: ${chunk.id}`);
  }
}

async function main() {
  const datasetPath = path.resolve(required("--dataset"));
  const corpusPath = path.resolve(required("--corpus"));
  const minimumCaseCount = positiveInteger("--minimum-case-count", 100);
  const k = positiveInteger("--k", 5);
  const rrfKCandidates = rrfKValues();
  const requestedStrategies = strategies();
  const dataset = validateHumanGoldenSet(JSON.parse(await readFile(datasetPath, "utf8")));
  const readiness = assessHumanGoldenSetReadiness(dataset, minimumCaseCount);
  if (!readiness.eligibleForRetrievalEvaluation) {
    console.log(JSON.stringify({ status: "not_ready", datasetPath, readiness }, null, 2));
    return;
  }

  const chunks = JSON.parse(await readFile(corpusPath, "utf8")) as Chunk[];
  assertCorpusMatchesDataset(dataset, chunks);
  const fixtures: GradedRetrievalFixture[] = dataset.cases.map(({ caseId, query, relevantChunks }) => ({ id: caseId, query, relevantChunks }));
  const corpusSha256 = hashRetrievalCorpus(chunks);
  const results: Partial<Record<Strategy, unknown>> = {};
  const queryEmbeddings = new Map<string, number[]>();
  let embeddingModel: string | undefined;

  if (requestedStrategies.some((strategy) => strategy !== "tfidf")) {
    embeddingModel = process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL;
    const vectors = await embedTexts([
      ...chunks.map((chunk) => [chunk.metadata.documentTitle, chunk.metadata.fileName, chunk.metadata.heading, chunk.metadata.headingPath, chunk.content].filter(Boolean).join("\n")),
      ...fixtures.map((fixture) => fixture.query),
    ]);
    const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] }));
    fixtures.forEach((fixture, index) => queryEmbeddings.set(fixture.query, vectors[chunks.length + index]));
    const embeddingRetriever = (query: string, _candidateChunks: Chunk[], limit: number): RetrievedChunk[] => {
      const queryEmbedding = queryEmbeddings.get(query);
      return queryEmbedding ? retrieveByEmbedding(queryEmbedding, embeddedChunks, limit) : [];
    };
    if (requestedStrategies.includes("embedding")) results.embedding = evaluateGradedRetrieval(fixtures, chunks, k, embeddingRetriever);
    if (requestedStrategies.includes("hybrid")) {
      const hybridCandidates = rrfKCandidates.map((rrfK) => ({
        rrfK,
        metrics: evaluateGradedRetrieval(fixtures, chunks, k, (query, _candidateChunks, limit) => {
          const keyword = retrieveChunks(query, chunks, limit);
          const semantic = embeddingRetriever(query, chunks, limit);
          return reciprocalRankFusion([keyword, semantic], { limit, k: rrfK }).map(({ rrfScore, ...rest }) => ({ ...rest, score: rrfScore }));
        }),
      }));
      results.hybrid = selectRrfTuningCandidate(hybridCandidates);
    }
  }
  if (requestedStrategies.includes("tfidf")) results.tfidf = evaluateGradedRetrieval(fixtures, chunks, k, retrieveChunks);

  console.log(JSON.stringify({
    status: "ok",
    datasetId: dataset.datasetId,
    datasetSha256: hashHumanGoldenSet(dataset),
    sourceSnapshot: dataset.sourceSnapshot,
    datasetPath,
    corpusPath,
    corpusSha256,
    caseCount: fixtures.length,
    chunkCount: chunks.length,
    k,
    rrfKCandidates: requestedStrategies.includes("hybrid") ? rrfKCandidates : undefined,
    embeddingModel,
    relevancePolicy: "relevance >= 2 counts as answerable evidence; relevance = 1 is excluded from Recall/MRR and treated as irrelevant in result-rate; NDCG uses graded gains.",
    results,
    limitation: "A tuning decision is emitted only after the human Golden Set readiness gate passes. It is valid only for the frozen dataset, corpus hash, embedding model, and retrieval implementation in this output; it does not prove production RAG quality.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
