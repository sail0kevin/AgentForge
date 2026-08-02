import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSION } from "./embedding-client";
import type { Chunk } from "./chunker";
import { retrieveWithAvailableStrategy } from "./document-service";

const vector = (first: number, second = 0) => [first, second, ...Array.from({ length: EMBEDDING_DIMENSION - 2 }, () => 0)];
const chunks: Chunk[] = [
  { id: "budget", documentId: "doc-budget", content: "token budget control", startLine: 0, endLine: 1, metadata: { documentTitle: "Budget" } },
  { id: "runtime", documentId: "doc-runtime", content: "runtime spending protection", startLine: 0, endLine: 1, metadata: { documentTitle: "Runtime" } },
];

const currentEmbeddings = [
  { model: "bge-m3", dimension: EMBEDDING_DIMENSION, vectorJson: JSON.stringify(vector(0, 1)) },
  { model: "bge-m3", dimension: EMBEDDING_DIMENSION, vectorJson: JSON.stringify(vector(1, 0)) },
];

test("document retrieval keeps TF-IDF when hybrid retrieval is disabled", async () => {
  let embedded = false;
  const results = await retrieveWithAvailableStrategy("token budget", chunks, currentEmbeddings, 2, {
    enabled: false,
    embedQuery: async () => { embedded = true; return vector(1); },
  });

  assert.equal(embedded, false);
  assert.deepEqual(results.map((result) => result.id), ["budget"]);
});

test("document retrieval keeps TF-IDF when any vector is stale, malformed, or missing", async () => {
  let embedded = false;
  const results = await retrieveWithAvailableStrategy("token budget", chunks, [currentEmbeddings[0], null], 2, {
    enabled: true,
    embedQuery: async () => { embedded = true; return vector(1); },
  });

  assert.equal(embedded, false);
  assert.deepEqual(results.map((result) => result.id), ["budget"]);
});

test("document retrieval uses hybrid RRF only with a complete current vector set", async () => {
  const results = await retrieveWithAvailableStrategy("token budget", chunks, currentEmbeddings, 2, {
    enabled: true,
    embedQuery: async () => vector(1, 0),
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].id, "budget");
  assert.ok(results.every((result) => result.score > 0));
});

test("document retrieval falls back to TF-IDF when query embedding fails", async () => {
  const results = await retrieveWithAvailableStrategy("token budget", chunks, currentEmbeddings, 2, {
    enabled: true,
    embedQuery: async () => { throw new Error("embedding offline"); },
  });

  assert.deepEqual(results.map((result) => result.id), ["budget"]);
});
