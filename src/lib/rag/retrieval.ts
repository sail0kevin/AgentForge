import type { Chunk } from "./chunker";

export type RetrievedChunk = Chunk & {
  score: number;
};

const MIN_TOKEN_LENGTH = 2;

export function retrieveChunks(query: string, chunks: Chunk[], limit = 5): RetrievedChunk[] {
  if (query.trim().length === 0 || chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const idf = computeIdf(chunks, queryTokens);

  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: scoreChunk(queryTokens, chunk, idf),
  }));

  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatRetrievedChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  return [
    "Retrieved knowledge chunks from document library:",
    ...chunks.map(
      (chunk, index) =>
        `[${index + 1}] (Document: ${chunk.documentId}, Lines ${chunk.startLine + 1}-${chunk.endLine + 1}, Score: ${chunk.score.toFixed(2)})\n${chunk.content.slice(0, 1500)}`
    ),
    "Use these chunks when relevant. If they do not help answer the user's question, rely on the conversation context instead.",
  ].join("\n\n");
}

function computeIdf(chunks: Chunk[], tokens: string[]): Map<string, number> {
  const idf = new Map<string, number>();
  const totalDocs = chunks.length;

  for (const token of tokens) {
    const docsWithToken = chunks.filter((chunk) =>
      tokenize(`${chunk.content}`).includes(token)
    ).length;
    idf.set(token, Math.log((totalDocs + 1) / (docsWithToken + 1)));
  }

  return idf;
}

function scoreChunk(queryTokens: string[], chunk: Chunk, idf: Map<string, number>): number {
  const chunkTokens = tokenize(chunk.content);
  const chunkTfidf = new Map<string, number>();

  for (const token of chunkTokens) {
    chunkTfidf.set(token, (chunkTfidf.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const token of queryTokens) {
    const tf = (chunkTfidf.get(token) ?? 0) / Math.max(chunkTokens.length, 1);
    const tokenIdf = idf.get(token) ?? 1;
    score += tf * tokenIdf;
  }

  return score;
}

export function tokenize(value: string): string[] {
  const normalized = value.toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9_\-]{2,}/g) ?? [];
  const cjkTokens =
    normalized.match(/[\u4e00-\u9fff]{1,}/g)?.flatMap((chunk) => splitCjkChunk(chunk)) ?? [];
  return Array.from(new Set([...latinTokens, ...cjkTokens].filter((t) => t.length >= MIN_TOKEN_LENGTH)));
}

function splitCjkChunk(chunk: string): string[] {
  if (chunk.length <= MIN_TOKEN_LENGTH) return [chunk];
  const tokens: string[] = [];
  for (let i = 0; i < chunk.length - 1; i += 1) {
    tokens.push(chunk.slice(i, i + 2));
  }
  return tokens;
}
