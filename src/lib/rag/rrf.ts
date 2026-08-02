/**
 * RRF（Reciprocal Rank Fusion，倒数排名融合）
 *
 * 作用：把两路（或多路）检索结果融合成一个排名。本项目用它融合
 *       TF-IDF 关键词检索（retrieveChunks）和 embedding 语义检索（retrieveByEmbedding）。
 *
 * 原理：每个 chunk 在某一路里排第 r 名（r 从 1 开始），贡献分数 1/(k + r)；
 *       在多路里出现就把各路贡献相加。k 是平滑常数（论文常用 60），
 *       作用是压低"只在某一路靠前"的极端影响，让"多路都还行"的结果更容易冒头。
 *
 * 为什么用 RRF 而不是直接加权分数：TF-IDF 分数和余弦相似度量纲完全不同
 *       （一个是 tf*idf 累加，一个是 [-1,1]），直接相加没有可比性。
 *       RRF 只看"排第几名"，天然消除量纲差异，无需归一化调参，鲁棒且好解释。
 *
 * 保留现有实现：本模块不修改 retrieveChunks / retrieveByEmbedding，只消费它们的输出，
 *       两路各自仍可独立使用。
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
