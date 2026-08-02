/**
 * 阶段五：真实单 Agent vs 多 Agent 对比评测（LongCat-2.0，OpenAI 兼容协议）。
 *
 * 单 Agent 基线：一次直接模型调用生成完整方案，不经过 product-graph 的 StateGraph。
 * 多 Agent 路径：走真实 planRequirement -> runReviewWorkflow 流程（Planner + 双候选 + 评审 + 评价）。
 * 两路都用 LongCat-2.0 作为底层模型，checklist 关键词命中做规则打分，不采用主观人工评分或 LLM 判分。
 *
 * 使用示例：
 *   npx tsx scripts/agent-comparison.ts --limit 2          # 冒烟测试，先用少量 case 验证联通性
 *   npx tsx scripts/agent-comparison.ts                    # 跑完整清单
 *   npx tsx scripts/agent-comparison.ts --output out.json  # 同时写入完整结果文件
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { DEFAULT_PLANNER_BUDGET } from "@/lib/planner/planner-service";
import { runCaseComparison } from "@/lib/review/agent-comparison";
import { aggregateChecklistScores, scoreChecklistAgainstText, type ChecklistScoreResult } from "@/lib/review/checklist-scoring";
import { ReviewBudgetSchema } from "@/lib/review/contracts";
import { validateLightweightCaseManifest, type LightweightCase } from "@/lib/review/lightweight-case-manifest";
import { createLongCatCallModel, readLongCatConfigFromEnv } from "@/lib/review/longcat-client";

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

type ArmScore = { caseId: string; result: ChecklistScoreResult | null; excludedReason: string | null };

function summarizeArm(scores: ArmScore[]) {
  const scored = scores.flatMap((item) => item.result ? [item.result] : []);
  const excluded = scores.filter((item) => item.excludedReason !== null).map((item) => ({ caseId: item.caseId, reason: item.excludedReason }));
  return { aggregate: aggregateChecklistScores(scored), scoredCaseCount: scored.length, excludedCases: excluded };
}

async function main() {
  const manifestPath = path.resolve(flagValue("--manifest") ?? "docs/quality - 质量评测/lightweight-case-manifest.json");
  const limitRaw = flagValue("--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const outputPath = flagValue("--output");
  const singleAgentMaxCostUsd = Number.parseFloat(flagValue("--single-agent-max-cost-usd") ?? "1");
  const multiAgentMaxCostUsd = Number.parseFloat(flagValue("--multi-agent-max-cost-usd") ?? "3");

  const manifest = validateLightweightCaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const cases: LightweightCase[] = limit ? manifest.cases.slice(0, limit) : manifest.cases;

  const config = readLongCatConfigFromEnv();
  const reviewBudget = ReviewBudgetSchema.parse({});

  const singleAgentScores: ArmScore[] = [];
  const multiAgentScores: ArmScore[] = [];
  const caseReports: unknown[] = [];
  let singleAgentTotalCostUsd = 0;
  let multiAgentTotalCostUsd = 0;
  let singleAgentCallCount = 0;
  let multiAgentCallCount = 0;

  for (const testCase of cases) {
    // Multi-agent's structured stages (plan: up to 12 tasks + 20 report sections + 12 evaluation dimensions;
    // candidates: up to 20 decisions + 30 implementation steps) need far more headroom than the 4_000-token
    // default, which truncated plan JSON mid-structure (see docs/quality diagnosis). Larger cases (e.g. cross-border
    // ecommerce plans) also outrun the router's 120s PROVIDER_TIMEOUT_MS default at this token budget, so this
    // harness raises the per-call timeout too — production callers never pass timeoutMs, so their 120s default
    // is untouched. Single-agent's free-text solution has not shown either symptom, so its defaults are left as-is.
    const singleAgent = createLongCatCallModel({ config, maxTotalCostUsd: singleAgentMaxCostUsd });
    const multiAgent = createLongCatCallModel({ config, maxTotalCostUsd: multiAgentMaxCostUsd, maxTokens: 12_000, timeoutMs: 180_000 });

    const result = await runCaseComparison({
      testCase,
      singleAgentCallModel: singleAgent.callModel,
      multiAgentCallModel: multiAgent.callModel,
      plannerBudget: DEFAULT_PLANNER_BUDGET,
      reviewBudget,
    });

    singleAgentTotalCostUsd = Number((singleAgentTotalCostUsd + singleAgent.usage.costUsd).toFixed(8));
    multiAgentTotalCostUsd = Number((multiAgentTotalCostUsd + multiAgent.usage.costUsd).toFixed(8));
    singleAgentCallCount += singleAgent.usage.callCount;
    multiAgentCallCount += multiAgent.usage.callCount;

    const singleAgentScore: ArmScore = result.singleAgent.status === "ok"
      ? { caseId: testCase.caseId, result: scoreChecklistAgainstText(testCase, result.singleAgent.solutionText), excludedReason: null }
      : { caseId: testCase.caseId, result: null, excludedReason: `single-agent error: ${result.singleAgent.error}` };

    // A "ready" result can still carry an empty solutionText: when both candidate generations fail,
    // runReviewWorkflow returns candidates: [] (reviewStatus "inconclusive") and renderMultiAgentSolutionText
    // joins an empty array into "". Scoring that empty string would count as a literal 0/0 against the
    // checklist, which unfairly drags the aggregate down relative to the single-agent arm's real failures
    // (which are excluded, not zero-scored). Exclude on empty solutionText, not on reviewStatus alone —
    // "inconclusive" can also occur with real candidate content (e.g. revision rounds exhausted).
    const multiAgentScore: ArmScore = result.multiAgent.status === "ready" && result.multiAgent.solutionText.trim().length > 0
      ? { caseId: testCase.caseId, result: scoreChecklistAgainstText(testCase, result.multiAgent.solutionText), excludedReason: null }
      : {
          caseId: testCase.caseId,
          result: null,
          excludedReason: result.multiAgent.status === "error"
            ? `multi-agent error: ${result.multiAgent.error}`
            : result.multiAgent.status === "needs_clarification"
              ? "multi-agent needs_clarification"
              : `multi-agent produced no candidates (reviewStatus: ${result.multiAgent.reviewStatus})`,
        };

    singleAgentScores.push(singleAgentScore);
    multiAgentScores.push(multiAgentScore);

    caseReports.push({
      caseId: testCase.caseId,
      category: testCase.category,
      singleAgent: { status: result.singleAgent.status, ...(singleAgentScore.result ? { coverageRate: singleAgentScore.result.coverageRate, constraintSatisfactionRate: singleAgentScore.result.constraintSatisfactionRate } : {}), ...(singleAgentScore.excludedReason ? { excludedReason: singleAgentScore.excludedReason } : {}) },
      multiAgent: { status: result.multiAgent.status, ...(result.multiAgent.status === "ready" ? { reviewStatus: result.multiAgent.reviewStatus, assumptionRetryUsed: result.multiAgent.assumptionRetryUsed } : {}), ...(multiAgentScore.result ? { coverageRate: multiAgentScore.result.coverageRate, constraintSatisfactionRate: multiAgentScore.result.constraintSatisfactionRate } : {}), ...(multiAgentScore.excludedReason ? { excludedReason: multiAgentScore.excludedReason } : {}) },
    });

    console.error(`[${testCase.caseId}] single-agent=${result.singleAgent.status} multi-agent=${result.multiAgent.status}`);
  }

  const singleAgentSummary = summarizeArm(singleAgentScores);
  const multiAgentSummary = summarizeArm(multiAgentScores);

  const output = {
    status: "ok",
    manifestPath,
    manifestProtocolVersion: manifest.protocolVersion,
    model: config.model,
    sampleSize: cases.length,
    cases: caseReports,
    aggregate: {
      singleAgent: { coverageRate: singleAgentSummary.aggregate.averageCoverageRate, constraintSatisfactionRate: singleAgentSummary.aggregate.averageConstraintSatisfactionRate, scoredCaseCount: singleAgentSummary.scoredCaseCount, excludedCases: singleAgentSummary.excludedCases },
      multiAgent: { coverageRate: multiAgentSummary.aggregate.averageCoverageRate, constraintSatisfactionRate: multiAgentSummary.aggregate.averageConstraintSatisfactionRate, scoredCaseCount: multiAgentSummary.scoredCaseCount, excludedCases: multiAgentSummary.excludedCases },
    },
    usage: {
      singleAgentCostUsd: singleAgentTotalCostUsd,
      multiAgentCostUsd: multiAgentTotalCostUsd,
      totalCostUsd: Number((singleAgentTotalCostUsd + multiAgentTotalCostUsd).toFixed(8)),
      singleAgentCallCount,
      multiAgentCallCount,
    },
    limitation: "Coverage/constraint rates come from deterministic keyword matching against generated text, not human or LLM-judge review; a keyword hit proves a point was mentioned, not that it is technically correct or fully designed. Sample size is limited to this manifest's case count. When the multi-agent arm's planner requests clarification, it retries once with self-generated assumptions (mirroring the single-agent arm's 'assume instead of ask' rule) before being counted as excluded; assumptionRetryUsed=true marks cases where that retry produced the scored solution. Cases where either arm errored or still needed clarification after the retry are excluded from that arm's aggregate and listed under excludedCases.",
  };

  console.log(JSON.stringify(output, null, 2));
  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    await writeFile(resolvedOutput, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.error(`Wrote full result to ${resolvedOutput}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
