# Hybrid RAG Runtime Boundary

## 已实现

- TF-IDF remains the default retrieval path.
- With `RAG_EMBEDDINGS_ENABLED=true`, a successful document upload attempts vector persistence only after the Document and all DocumentChunks commit.
- Vectors are bound to the configured embedding model and the fixed dimension. Search uses RRF only when every chunk for the active user has a valid vector for that exact model and dimension.
- Missing, stale, malformed, or incomplete vectors, and embedding-provider failures, deterministically fall back to TF-IDF. A document upload remains successful even when optional vector generation is unavailable.
- `npm run rag:embeddings:backfill` is a read-only preflight. `npm run rag:embeddings:backfill -- --execute` requires `RAG_EMBEDDINGS_ENABLED=true`, only selects missing/stale/malformed vectors, and reports persistence activity without claiming retrieval quality.
- 人工 Golden Set 输入契约已实现于 `src/lib/rag/human-golden-set.ts`：每个来源、文档与 chunk 均要求 SHA-256 和快照关联；每条 query 必须有可追溯的相关 chunk、独立标注人与审核人、以及 `approved` 审核状态。`npm run quality:rag:human-golden:validate -- <dataset.json>` 只输出数据完整度和覆盖统计，不执行检索评测。

## 已验证

- Deterministic unit coverage verifies RRF fusion and that keyword and embedding retrieval receive the same searchable document representation.
- TypeScript, ESLint, full unit tests, and the frozen TF-IDF Golden Gate pass locally.

## 待实测

- A reachable local Ollama instance with the exact bge-m3 model.
- Backfill for documents uploaded before embeddings are enabled.
- Retrieval behavior on a multi-source, human-labelled Golden Set and a measured RRF parameter comparison.
- Operational telemetry for embedding latency, failure rate, and fallback rate.

## 目标设计

- 已建立来源快照契约；仍需由真实标注流程产出并审核至少 100 条多来源 query，之后才能用固定快照执行 Recall@5、MRR 与 NDCG@10。
- 在人工 Golden Set 上完成受控对照前，不调整 RRF 参数，也不宣称召回质量提升。
