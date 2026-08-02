/**
 * Ollama 本地 embedding 客户端
 *
 * 作用：把文本转成向量（embedding），供 embedding 检索和 RRF 混合检索使用。
 *       与 router.ts 的对话调用分开：那边打 /api/chat，这边打 /api/embed。
 *
 * 原理：Ollama 提供 /api/embed 接口，POST { model, input } 返回 { embeddings: number[][] }。
 *       这里沿用 router.ts 里 callOllama 的同款原始 fetch + baseUrl 解析方式，不引入额外依赖。
 *
 * 为什么维度写死 1024：本项目选用 bge-m3 模型，其向量维度固定为 1024。
 *       维度是数据库列和相似度计算的契约，必须固定；换模型需同步改这里和迁移。
 */

import { assertSafeProviderUrl } from "@/lib/security/provider-url";

/** bge-m3 的固定向量维度。换 embedding 模型必须同步改这里与 DocumentChunkEmbedding 迁移。 */
export const EMBEDDING_DIMENSION = 1024;

/** 默认 embedding 模型名，可用 OLLAMA_EMBED_MODEL 覆盖。 */
export const DEFAULT_EMBEDDING_MODEL = "bge-m3";

function embeddingBaseUrl(configuredBaseUrl?: string | null) {
  return configuredBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

function embeddingModel(configuredModel?: string | null) {
  return configuredModel || process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL;
}

function embeddingTimeoutMs() {
  const configured = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS || 60_000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 5 * 60_000) : 60_000;
}

export type EmbedOptions = {
  baseUrl?: string | null;
  model?: string | null;
  signal?: AbortSignal;
};

/**
 * 批量把多段文本转成向量。
 *
 * @param inputs 待编码的文本数组
 * @returns 与 inputs 顺序一致的向量数组，每个向量长度为 EMBEDDING_DIMENSION
 * @throws 当 Ollama 返回非 2xx、向量数量不匹配、或维度不符时抛错（明确失败，不静默降级）
 */
export async function embedTexts(inputs: string[], options: EmbedOptions = {}): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const baseUrl = embeddingBaseUrl(options.baseUrl);
  await assertSafeProviderUrl(baseUrl);
  const model = embeddingModel(options.model);

  // 组合调用方 signal 与本地超时：任一触发都中止请求。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("EMBEDDING_TIMEOUT")), embeddingTimeoutMs());
  const onParentAbort = () => controller.abort(options.signal?.reason ?? new Error("EMBEDDING_ABORTED"));
  if (options.signal?.aborted) onParentAbort();
  else options.signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, input: inputs }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Ollama embed failed: ${response.status} ${detail}`.trim());
    }

    const data = (await response.json()) as { embeddings?: number[][] };
    const embeddings = data.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
      throw new Error(`Ollama embed returned ${embeddings?.length ?? 0} vectors for ${inputs.length} inputs.`);
    }
    for (const vector of embeddings) {
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Ollama embed vector dimension ${vector?.length ?? 0} does not match expected ${EMBEDDING_DIMENSION}.`);
      }
    }
    return embeddings;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onParentAbort);
  }
}

/** 单段文本转向量的便捷封装。 */
export async function embedText(input: string, options: EmbedOptions = {}): Promise<number[]> {
  const [vector] = await embedTexts([input], options);
  return vector;
}
