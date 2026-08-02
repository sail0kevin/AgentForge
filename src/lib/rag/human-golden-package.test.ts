import assert from "node:assert/strict";
import test from "node:test";
import type { Chunk } from "./chunker";
import { buildHumanGoldenAnnotationPackage } from "./human-golden-package";

const digest = "a".repeat(64);
const chunks: Chunk[] = [{
  id: "architecture-chunk-0",
  documentId: "architecture",
  content: "checkpoint recovery",
  startLine: 0,
  endLine: 1,
  metadata: { documentTitle: "Architecture", headingPath: "Recovery" },
}];

test("annotation package derives chunk hashes and leaves cases for humans", () => {
  const result = buildHumanGoldenAnnotationPackage(chunks, [{
    sourceId: "source-architecture",
    documentId: "architecture",
    documentType: "technical",
    version: "v1",
    contentSha256: digest,
    license: "project",
  }]);

  assert.match(result["chunks.tsv"], /architecture-chunk-0\tsource-architecture\tarchitecture\t[a-f0-9]{64}/);
  assert.match(result["cases.tsv"], /^caseId\tquery\tqueryType/m);
  assert.doesNotMatch(result["cases.tsv"], /rag-case-/);
  assert.match(result["README.md"], /Source\/chunk snapshot SHA-256: [a-f0-9]{64}/);
});

test("annotation package rejects a corpus document without explicit source metadata", () => {
  assert.throws(() => buildHumanGoldenAnnotationPackage(chunks, [{
    sourceId: "source-api",
    documentId: "api",
    documentType: "api-reference",
    version: "v1",
    contentSha256: digest,
    license: "project",
  }]), /RAG_HUMAN_GOLDEN_PACKAGE_CHUNK_SOURCE_UNKNOWN/);
});
