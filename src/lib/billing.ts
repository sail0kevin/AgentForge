import Decimal from "decimal.js";
import type { Provider, WorkspaceStatus } from "@/lib/types";

type Pricing = {
  input: number;
  output: number;
};

const PRICING_USD_PER_MILLION: Record<string, Pricing> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-3-5-sonnet-latest": { input: 3, output: 15 },
  "claude-3-5-sonnet-20240620": { input: 3, output: 15 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  // LongCat 官方标准价；当前计费接口无法识别缓存 token，因此输入统一按未缓存价格计算。
  "LongCat-2.0": { input: 0.75, output: 2.95 },
  default: { input: 1, output: 3 },
};

export const LONGCAT_STANDARD_PRICING = {
  model: "LongCat-2.0",
  inputUsdPerMillion: 0.75,
  outputUsdPerMillion: 2.95,
  sourceUrl: "https://longcat.chat/platform/docs/pricing/long-cat-2.0",
  retrievedAt: "2026-08-01T00:00:00+08:00",
} as const;

export function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICING_USD_PER_MILLION[model] ?? PRICING_USD_PER_MILLION.default;
  const inputCost = new Decimal(inputTokens).div(1_000_000).mul(price.input);
  const outputCost = new Decimal(outputTokens).div(1_000_000).mul(price.output);
  const costUsd = inputCost.add(outputCost);
  const rate = new Decimal(process.env.USD_CNY_RATE || "7.25");

  return {
    costUsd: Number(costUsd.toFixed(8)),
    costCny: Number(costUsd.mul(rate).toFixed(8)),
  };
}

export function getBudgetStatus(totalSpent: number, budgetLimit: number): WorkspaceStatus {
  if (totalSpent >= budgetLimit) return "exhausted";
  if (totalSpent >= budgetLimit * 0.8) return "warning";
  return "idle";
}

export function providerLabel(provider: Provider) {
  if (provider === "anthropic") return "Anthropic";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "ollama") return "Ollama";
  if (provider === "custom") return "Custom OpenAI-compatible";
  return "OpenAI";
}
