export type PairedMetricObservation = {
  caseId: string;
  trial: number;
  variant: string;
  value: number | null;
};

export type PairedBootstrapSummary = {
  pairCount: number;
  excludedPairCount: number;
  meanDelta: number | null;
  confidenceInterval95: { lower: number; upper: number } | null;
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function percentile(sorted: number[], probability: number) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * probability) - 1));
  return sorted[index];
}

/** 使用固定伪随机序列，保证相同输入在本地和 CI 中得到相同的置信区间。 */
function createDeterministicRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * 对同一 case/trial 的两组结果做配对 bootstrap。
 * 缺失值和失败运行不填零，必须保留为排除数量，避免把可用性问题伪装成质量分数。
 */
export function pairedBootstrapDelta(input: {
  observations: PairedMetricObservation[];
  baselineVariant: string;
  treatmentVariant: string;
  resamples?: number;
  seed?: number;
}): PairedBootstrapSummary {
  const byRun = new Map(input.observations.map((item) => [`${item.caseId}:${item.trial}:${item.variant}`, item.value]));
  const runKeys = new Set(input.observations
    .filter((item) => item.variant === input.baselineVariant || item.variant === input.treatmentVariant)
    .map((item) => `${item.caseId}:${item.trial}`));
  const deltas: number[] = [];
  let excludedPairCount = 0;

  for (const key of runKeys) {
    const baseline = byRun.get(`${key}:${input.baselineVariant}`);
    const treatment = byRun.get(`${key}:${input.treatmentVariant}`);
    if (baseline === undefined || treatment === undefined || baseline === null || treatment === null) {
      excludedPairCount += 1;
      continue;
    }
    deltas.push(treatment - baseline);
  }

  if (deltas.length === 0) {
    return { pairCount: 0, excludedPairCount, meanDelta: null, confidenceInterval95: null };
  }

  const meanDelta = round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
  const random = createDeterministicRandom(input.seed ?? 2_026_0730);
  const resamples = input.resamples ?? 10_000;
  const bootstrapMeans = Array.from({ length: resamples }, () => {
    let sum = 0;
    for (let index = 0; index < deltas.length; index += 1) sum += deltas[Math.floor(random() * deltas.length)];
    return sum / deltas.length;
  }).sort((left, right) => left - right);

  return {
    pairCount: deltas.length,
    excludedPairCount,
    meanDelta,
    confidenceInterval95: { lower: round(percentile(bootstrapMeans, 0.025)), upper: round(percentile(bootstrapMeans, 0.975)) },
  };
}
