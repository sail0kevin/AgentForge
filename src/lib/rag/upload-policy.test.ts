import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDocumentQuota,
  assertUploadFileMetadata,
  assertUploadRequestSize,
  decodeUtf8Document,
  DOCUMENT_UPLOAD_LIMITS,
  DocumentUploadError,
  parseKnowledgeSourceMetadata,
} from "./upload-policy";

function expectCode(callback: () => void, code: string) {
  assert.throws(callback, (error: unknown) => error instanceof DocumentUploadError && error.code === code);
}

test("request Content-Length is rejected before multipart parsing when it exceeds 6 MiB", () => {
  expectCode(() => assertUploadRequestSize(new Headers({ "content-length": String(DOCUMENT_UPLOAD_LIMITS.maxRequestBytes + 1) })), "REQUEST_TOO_LARGE");
});

test("file metadata uses byte size and rejects oversize before content reading", () => {
  expectCode(() => assertUploadFileMetadata({ name: "large.md", size: DOCUMENT_UPLOAD_LIMITS.maxFileBytes + 1 }), "FILE_TOO_LARGE");
  expectCode(() => assertUploadFileMetadata({ name: "empty.md", size: 0 }), "EMPTY_FILE");
});

test("UTF-8 decoding accepts Chinese bytes and rejects malformed input", () => {
  const encoded = new TextEncoder().encode("中文资料");
  assert.equal(decodeUtf8Document(encoded.buffer as ArrayBuffer), "中文资料");
  expectCode(() => decodeUtf8Document(Uint8Array.from([0xc3, 0x28]).buffer as ArrayBuffer), "INVALID_UTF8");
});

test("document count, total bytes, per-document chunks, and total chunks have stable errors", () => {
  expectCode(() => assertDocumentQuota({ documentCount: 100, totalBytes: 0, totalChunks: 0 }, 1, 1), "DOCUMENT_LIMIT_REACHED");
  expectCode(() => assertDocumentQuota({ documentCount: 0, totalBytes: DOCUMENT_UPLOAD_LIMITS.maxTotalBytesPerUser, totalChunks: 0 }, 1, 1), "STORAGE_QUOTA_EXCEEDED");
  expectCode(() => assertDocumentQuota({ documentCount: 0, totalBytes: 0, totalChunks: 0 }, 1, DOCUMENT_UPLOAD_LIMITS.maxChunksPerDocument + 1), "TOO_MANY_CHUNKS");
  expectCode(() => assertDocumentQuota({ documentCount: 0, totalBytes: 0, totalChunks: DOCUMENT_UPLOAD_LIMITS.maxChunksPerUser }, 1, 1), "CHUNK_QUOTA_EXCEEDED");
});

test("knowledge source metadata accepts traceable fields and rejects unsafe URLs", () => {
  const valid = new FormData();
  valid.set("sourceType", "curated-reference");
  valid.set("sourceUrl", "https://www.w3.org/TR/WCAG22/");
  valid.set("sourceVersion", "2.2");
  valid.set("license", "W3C Document License");
  valid.set("reviewedAt", "2026-07-15T00:00:00.000Z");
  const metadata = parseKnowledgeSourceMetadata(valid);
  assert.equal(metadata.sourceVersion, "2.2");
  assert.equal(metadata.reviewedAt?.toISOString(), "2026-07-15T00:00:00.000Z");

  const unsafe = new FormData();
  unsafe.set("sourceUrl", "file:///etc/passwd");
  expectCode(() => parseKnowledgeSourceMetadata(unsafe), "INVALID_SOURCE_URL");
});
