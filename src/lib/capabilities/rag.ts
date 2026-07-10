import type { KnowledgeSnippet } from "@/lib/types";

export type RetrievedSnippet = KnowledgeSnippet & {
  score: number;
};

const MIN_TOKEN_LENGTH = 2;

export function retrieveKnowledgeSnippets(query: string, snippets: KnowledgeSnippet[], limit = 3): RetrievedSnippet[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || snippets.length === 0) return [];

  return snippets
    .map((snippet) => ({ ...snippet, score: scoreSnippet(queryTokens, snippet) }))
    .filter((snippet) => snippet.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function formatRetrievedKnowledge(snippets: RetrievedSnippet[]) {
  if (snippets.length === 0) return "";

  return [
    "Retrieved local knowledge snippets:",
    ...snippets.map((snippet, index) => `[${index + 1}] ${snippet.title}\n${snippet.content.slice(0, 1200)}`),
    "Use these snippets only when they are relevant to the user's request. If they are not relevant, say so and answer from the available conversation context.",
  ].join("\n\n");
}

function scoreSnippet(queryTokens: string[], snippet: KnowledgeSnippet) {
  const source = `${snippet.title}\n${snippet.content}`.toLowerCase();
  return queryTokens.reduce((score, token) => score + countOccurrences(source, token), 0);
}

function tokenize(value: string) {
  const normalized = value.toLowerCase();
  const latinTokens = normalized.match(/[a-z0-9_\-]{2,}/g) ?? [];
  const cjkTokens = normalized.match(/[\u4e00-\u9fff]{1,}/g)?.flatMap((chunk) => splitCjkChunk(chunk)) ?? [];
  return Array.from(new Set([...latinTokens, ...cjkTokens].filter((token) => token.length >= MIN_TOKEN_LENGTH)));
}

function splitCjkChunk(chunk: string) {
  if (chunk.length <= MIN_TOKEN_LENGTH) return [chunk];
  const tokens: string[] = [];
  for (let index = 0; index < chunk.length - 1; index += 1) {
    tokens.push(chunk.slice(index, index + 2));
  }
  return tokens;
}

function countOccurrences(source: string, token: string) {
  let count = 0;
  let index = source.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = source.indexOf(token, index + token.length);
  }
  return count;
}
