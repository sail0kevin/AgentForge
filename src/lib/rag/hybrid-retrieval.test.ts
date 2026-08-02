import assert from "node:assert/strict";
import test from "node:test";
import type { EmbeddedChunk } from "./embedding-retrieval";
import { retrieveHybridChunks, searchableChunkText } from "./hybrid-retrieval";

function chunk(id: string, content: string, embedding: number[]): EmbeddedChunk {
  return {
    id,
    documentId: `doc-${id}`,
    content,
    startLine: 0,
    endLine: 1,
    metadata: { documentTitle: `Document ${id}`, headingPath: "Knowledge > Retrieval" },
    embedding,
  };
}

test("hybrid retrieval fuses keyword and semantic rankings with deterministic RRF output", () => {
  const chunks = [
    chunk("keyword", "token budget policy", [0, 1]),
    chunk("semantic", "runtime spending controls", [1, 0]),
    chunk("both", "token budget runtime controls", [1, 0]),
  ];
  const results = retrieveHybridChunks("token budget", [1, 0], chunks, 3);

  assert.equal(results.length, 3);
  assert.equal(results[0].id, "both");
  assert.ok(results.every((result) => result.score > 0));
});

test("hybrid retrieval uses the same metadata and content text as keyword retrieval", () => {
  assert.equal(
    searchableChunkText(chunk("one", "content body", [1, 0])),
    "Document one\nKnowledge > Retrieval\ncontent body",
  );
});
