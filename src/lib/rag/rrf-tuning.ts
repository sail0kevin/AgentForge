import type { GradedRetrievalMetrics } from "./graded-evaluation";

export type RrfTuningCandidate = {
  rrfK: number;
  metrics: GradedRetrievalMetrics;
};

export type RrfTuningDecision = {
  selected: RrfTuningCandidate;
  candidates: RrfTuningCandidate[];
  selectionPolicy: string;
};

function assertValidCandidate(candidate: RrfTuningCandidate) {
  if (!Number.isInteger(candidate.rrfK) || candidate.rrfK < 1) {
    throw new Error("RAG_RRF_TUNING_K_INVALID: rrfK must be a positive integer");
  }
  for (const value of Object.values(candidate.metrics)) {
    if (!Number.isFinite(value)) throw new Error("RAG_RRF_TUNING_METRIC_INVALID");
  }
}

/**
 * 在同一冻结数据集和语料快照上，从候选 RRF k 中选择参数。
 * 选择规则固定为 Recall@K、NDCG@K、MRR、较低无关结果率、较小 k，避免事后挑选有利数字。
 */
export function selectRrfTuningCandidate(candidates: RrfTuningCandidate[]): RrfTuningDecision {
  if (!candidates.length) throw new Error("RAG_RRF_TUNING_CANDIDATES_REQUIRED");
  candidates.forEach(assertValidCandidate);
  if (new Set(candidates.map((candidate) => candidate.rrfK)).size !== candidates.length) {
    throw new Error("RAG_RRF_TUNING_K_DUPLICATE");
  }

  const ordered = [...candidates].sort((left, right) =>
    right.metrics.recallAtK - left.metrics.recallAtK
    || right.metrics.ndcgAtK - left.metrics.ndcgAtK
    || right.metrics.meanReciprocalRank - left.metrics.meanReciprocalRank
    || left.metrics.irrelevantResultRate - right.metrics.irrelevantResultRate
    || left.rrfK - right.rrfK,
  );

  return {
    selected: ordered[0],
    candidates: ordered,
    selectionPolicy: "Maximize Recall@K; then NDCG@K; then MRR; then minimize irrelevant-result rate; then choose the smaller RRF k.",
  };
}
