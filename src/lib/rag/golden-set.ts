import { createHash } from "node:crypto";
import { resumeFixtureChunks, resumeFixtures, resumeNoiseChunks } from "./resume-fixtures";

export const RAG_GOLDEN_SET_VERSION = "rag-golden-v0";

// 该快照来自 2026-07-30 对当前固定语料的实际离线执行，不是预设目标值。
export const RAG_GOLDEN_BASELINE = {
  cleanRecallAt1: {
    recallAtK: 1,
    meanReciprocalRank: 1,
    ndcgAtK: 1,
    irrelevantResultRate: 0,
    citationCompleteness: 1,
  },
  sharedNoiseRecallAt5: {
    recallAtK: 1,
    meanReciprocalRank: 1,
    ndcgAtK: 1,
    irrelevantResultRate: 0.5862068965517241,
    citationCompleteness: 1,
  },
  sharedNoiseNdcgAt10: {
    recallAtK: 1,
    meanReciprocalRank: 1,
    ndcgAtK: 1,
    irrelevantResultRate: 0.6470588235294118,
    citationCompleteness: 1,
  },
} as const;

export function ragGoldenSetManifest() {
  const payload = JSON.stringify({
    version: RAG_GOLDEN_SET_VERSION,
    fixtures: resumeFixtures,
    chunks: resumeFixtureChunks,
    noiseChunks: resumeNoiseChunks,
  });
  return {
    version: RAG_GOLDEN_SET_VERSION,
    fixtureCount: resumeFixtures.length,
    chunkCount: resumeFixtureChunks.length,
    noiseChunkCount: resumeNoiseChunks.length,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
}
