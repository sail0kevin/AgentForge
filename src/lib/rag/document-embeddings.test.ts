import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSION } from "./embedding-client";
import { selectChunksNeedingEmbeddings, type PersistedDocumentChunk } from "./document-embeddings";

const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.1);
const baseChunk: PersistedDocumentChunk = {
  id: "chunk-1",
  documentId: "doc-1",
  content: "Knowledge text",
  startLine: 0,
  endLine: 1,
  metadata: {},
};

test("embedding backfill skips only complete vectors for the current model contract", () => {
  const chunks = [
    { ...baseChunk, id: "ready", embedding: { model: "bge-m3", dimension: EMBEDDING_DIMENSION, vectorJson: JSON.stringify(vector) } },
    { ...baseChunk, id: "missing", embedding: null },
    { ...baseChunk, id: "old-model", embedding: { model: "older-model", dimension: EMBEDDING_DIMENSION, vectorJson: JSON.stringify(vector) } },
    { ...baseChunk, id: "bad-json", embedding: { model: "bge-m3", dimension: EMBEDDING_DIMENSION, vectorJson: "not-json" } },
    { ...baseChunk, id: "wrong-dimension", embedding: { model: "bge-m3", dimension: 2, vectorJson: "[0,1]" } },
  ];

  assert.deepEqual(selectChunksNeedingEmbeddings(chunks, "bge-m3").map((chunk) => chunk.id), ["missing", "old-model", "bad-json", "wrong-dimension"]);
});
