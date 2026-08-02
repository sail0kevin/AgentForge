import assert from "node:assert/strict";
import test from "node:test";
import type { Chunk } from "./chunker";
import type { HumanGoldenSourceManifestEntry } from "./human-golden-package";
import { buildHumanGoldenAnnotationWorklist } from "./human-golden-worklist";

const digest = "a".repeat(64);

const chunks: Chunk[] = [
  chunk("architecture-chunk-0", "architecture", "Checkpoint recovery and lease renewal workflow.", 0, 2),
  chunk("api-chunk-0", "api", "POST /api/workflows starts a new workflow run.", 5, 7),
  chunk("market-chunk-0", "market", "Internal pilot value depends on auditable review reports.", 10, 12),
  chunk("runbook-chunk-0", "runbook", "Run status checks before publishing pilot results.", 15, 16),
];

const sources: HumanGoldenSourceManifestEntry[] = [
  source("source-architecture", "architecture", "technical"),
  source("source-api", "api", "api-reference"),
  source("source-market", "market", "business"),
  source("source-runbook", "runbook", "runbook"),
] as HumanGoldenSourceManifestEntry[];

function chunk(id: string, documentId: string, content: string, startLine: number, endLine: number): Chunk {
  return { id, documentId, content, startLine, endLine, metadata: {} };
}

function source(sourceId: string, documentId: string, documentType: "technical" | "business" | "api-reference" | "runbook") {
  return {
    sourceId,
    documentId,
    documentType,
    version: "v1",
    contentSha256: digest,
    license: "project",
  };
}

test("annotation worklist is deterministic and covers required document types first", () => {
  const first = buildHumanGoldenAnnotationWorklist(chunks, sources, {
    targetCaseCount: 3,
    seed: 20260802,
  });
  const second = buildHumanGoldenAnnotationWorklist(chunks, sources, {
    targetCaseCount: 3,
    seed: 20260802,
  });

  assert.equal(first["annotation-worklist.tsv"], second["annotation-worklist.tsv"]);
  assert.equal(first["annotation-worklist.tsv"].trim().split("\n").length - 1, 3);
  assert.match(first["annotation-worklist.tsv"], /\ttechnical\t/);
  assert.match(first["annotation-worklist.tsv"], /\tapi-reference\t/);
  assert.match(first["annotation-worklist.tsv"], /\tbusiness\t/);
});

test("annotation worklist leaves human annotation columns blank and avoids fake cases", () => {
  const result = buildHumanGoldenAnnotationWorklist(chunks, sources, {
    targetCaseCount: 1,
    seed: 1,
  });
  const row = result["annotation-worklist.tsv"].split("\n")[1];
  const cells = row.split("\t");

  assert.equal(cells.length, 19);
  assert.deepEqual(cells.slice(9, 19), Array.from({ length: 10 }, () => ""));
  assert.doesNotMatch(result["annotation-worklist.tsv"], /rag-case-/);
  assert.match(result["README.md"], /task queue, not a Golden Set/);
  assert.match(result["README.md"], /does not calculate Recall@5/);
});

test("annotation worklist refuses chunks without source metadata", () => {
  assert.throws(() => buildHumanGoldenAnnotationWorklist(chunks, [sources[0]], {
    targetCaseCount: 1,
  }), /RAG_HUMAN_GOLDEN_WORKLIST_CHUNK_SOURCE_UNKNOWN/);
});
