import assert from "node:assert/strict";
import test from "node:test";
import { chunkMarkdown } from "./chunker";
import { parseFile } from "./parser";
import { retrieveChunks, tokenize } from "./retrieval";

test("markdown headings survive parsing and become section metadata with real line numbers", () => {
  const source = "# 产品说明\n开场内容\n\n## 权限模型\n管理员只能查看自己的租户。\n\n### 审计\n所有修改都记录操作人。";
  const parsed = parseFile("guide.md", source);
  assert.match(parsed.content, /^# 产品说明/m);
  const chunks = chunkMarkdown(parsed.content, "doc-1");
  assert.equal(chunks.length, 3);
  assert.equal(chunks[1].metadata.headingPath, "产品说明 > 权限模型");
  assert.deepEqual([chunks[1].startLine, chunks[1].endLine], [3, 5]);
  assert.equal(chunks[2].metadata.headingPath, "产品说明 > 权限模型 > 审计");
});

test("tokenization preserves term frequency instead of deduplicating document terms", () => {
  const tokens = tokenize("cache cache cache 缓存缓存");
  assert.equal(tokens.filter((token) => token === "cache").length, 3);
  assert.ok(tokens.length > new Set(tokens).size);
});

test("a useful term present in every chunk no longer produces zero recall", () => {
  const chunks = [
    { id: "a", documentId: "doc-a", content: "权限 角色 管理", startLine: 0, endLine: 0, metadata: { headingPath: "权限设计" } },
    { id: "b", documentId: "doc-b", content: "权限 审计 日志", startLine: 0, endLine: 0, metadata: { headingPath: "安全审计" } },
  ];
  const results = retrieveChunks("权限", chunks);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.score > 0));
});

test("frequency, headings and deterministic tie breaking affect ranking", () => {
  const chunks = [
    { id: "z", documentId: "doc-z", content: "表单说明", startLine: 3, endLine: 3, metadata: { headingPath: "普通页面" } },
    { id: "a", documentId: "doc-a", content: "表单 表单 表单 错误摘要", startLine: 1, endLine: 1, metadata: { headingPath: "表单可访问性" } },
    { id: "b", documentId: "doc-b", content: "表单 错误摘要", startLine: 2, endLine: 2, metadata: { headingPath: "表单可访问性" } },
  ];
  const first = retrieveChunks("表单可访问性", chunks).map((item) => item.id);
  const second = retrieveChunks("表单可访问性", [...chunks].reverse()).map((item) => item.id);
  assert.equal(first[0], "a");
  assert.deepEqual(first, second);
});
