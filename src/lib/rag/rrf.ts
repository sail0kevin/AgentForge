/**
 * RRF（Reciprocal Rank Fusion，倒数排名融合）：把 TF-IDF 关键词检索与
 * embedding 语义检索两路排名融合成一个。
 * 每路第 r 名贡献 1/(k + r)，k 为平滑常数（默认 60）；多路出现则相加。
 * 选 RRF 而非直接加权分数：TF-IDF 与余弦相似度量纲不同，RRF 只看名次，
 * 天然消除量纲差异且可解释。本模块只消费两路检索的输出，不修改它们。
 */

import type { RetrievedChunk } from "./retrieval";

/** RRF 平滑常数，论文与主流实现默认 60。 */
export const DEFAULT_RRF_K = 60;

/** 一路检索结果：只需按名次排好的 chunk 列表（第 0 项为第 1 名）。 */
export type RankedList = RetrievedChunk[];

export type RrfResult = RetrievedChunk & {
  /** 融合后的 RRF 总分（各路 1/(k+rank) 之和）。 */
  rrfScore: number;
};

/**
 * 用 RRF 融合多路排名。
 *
 * @param rankedLists 多路检索结果，每路已按各自相关性降序排好
 * @param options.k 平滑常数，默认 DEFAULT_RRF_K
 * @param options.limit 返回条数上限，默认 5
 * @returns 按 RRF 总分降序的融合结果；chunk 元数据取自它首次出现的那一路
 */
export function reciprocalRankFusion(
  rankedLists: RankedList[],
  options: { k?: number; limit?: number } = {},
): RrfResult[] {
  const k = options.k ?? DEFAULT_RRF_K;
  const limit = options.limit ?? 5;

  // 按 chunk id 聚合各路贡献；chunk 本体保留首次遇到的那份。
  const accumulator = new Map<string, { chunk: RetrievedChunk; rrfScore: number }>();

  for (const list of rankedLists) {
    list.forEach((chunk, index) => {
      const rank = index + 1; // 名次从 1 开始
      const contribution = 1 / (k + rank);
      const existing = accumulator.get(chunk.id);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        accumulator.set(chunk.id, { chunk, rrfScore: contribution });
      }
    });
  }

  return Array.from(accumulator.values())
    .map((entry) => ({ ...entry.chunk, rrfScore: entry.rrfScore }))
    // 相同 RRF 分用与两路一致的确定性 tie-break，保证融合结果可复现。
    .sort((a, b) => b.rrfScore - a.rrfScore || a.documentId.localeCompare(b.documentId) || a.startLine - b.startLine || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
