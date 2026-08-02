import assert from "node:assert/strict";
import test from "node:test";
import { aggregateChecklistScores, scoreChecklistAgainstText } from "./checklist-scoring";
import type { LightweightCase } from "./lightweight-case-manifest";

function buildCase(): LightweightCase {
  return {
    caseId: "lw-case-01",
    category: "ecommerce",
    complexity: "medium",
    requirement: "Plan a checkout flow with coupon rules, stock deduction, payment timeout release, and idempotent order handling for repeat submissions.",
    checklist: [
      { id: "coupon-rule", description: "覆盖优惠券叠加规则", keywords: ["优惠券", "叠加"], isConstraint: true },
      { id: "stock-deduct", description: "覆盖库存扣减", keywords: ["库存", "扣减"], isConstraint: false },
      { id: "payment-timeout", description: "覆盖支付超时释放", keywords: ["超时", "释放"], isConstraint: true },
      { id: "order-state", description: "覆盖订单状态机", keywords: ["状态机"], isConstraint: false },
      { id: "duplicate-order", description: "覆盖幂等处理", keywords: ["幂等", "去重"], isConstraint: true },
    ],
  };
}

test("scoreChecklistAgainstText matches all keywords case-insensitively and computes full coverage", () => {
  const testCase = buildCase();
  const text = "方案包含 优惠券叠加规则、库存扣减机制、支付超时释放库存、订单状态机设计和幂等处理重复下单。";
  const result = scoreChecklistAgainstText(testCase, text);
  assert.equal(result.totalPoints, 5);
  assert.equal(result.matchedPoints, 5);
  assert.equal(result.coverageRate, 1);
  assert.equal(result.constraintPoints, 3);
  assert.equal(result.matchedConstraintPoints, 3);
  assert.equal(result.constraintSatisfactionRate, 1);
});

test("scoreChecklistAgainstText computes partial coverage and constraint satisfaction", () => {
  const testCase = buildCase();
  const text = "方案包含库存扣减机制和订单状态机设计，其他细节留待后续补充。";
  const result = scoreChecklistAgainstText(testCase, text);
  assert.equal(result.matchedPoints, 2);
  assert.equal(result.coverageRate, 2 / 5);
  assert.equal(result.matchedConstraintPoints, 0);
  assert.equal(result.constraintSatisfactionRate, 0);
  const stockHit = result.hits.find((hit) => hit.id === "stock-deduct");
  assert.equal(stockHit?.matched, true);
  assert.equal(stockHit?.matchedKeyword, "库存");
});

test("scoreChecklistAgainstText returns null constraintSatisfactionRate when case has no constraint points", () => {
  const testCase = buildCase();
  testCase.checklist = testCase.checklist.map((item) => ({ ...item, isConstraint: false }));
  const result = scoreChecklistAgainstText(testCase, "方案什么都没提到。");
  assert.equal(result.constraintPoints, 0);
  assert.equal(result.constraintSatisfactionRate, null);
});

test("aggregateChecklistScores averages coverage and constraint satisfaction across cases", () => {
  const testCase = buildCase();
  const fullMatchText = "优惠券叠加规则、库存扣减、支付超时释放、订单状态机、幂等处理。";
  const noMatchText = "方案未提及任何关键点。";
  const results = [
    scoreChecklistAgainstText(testCase, fullMatchText),
    scoreChecklistAgainstText(testCase, noMatchText),
  ];
  const aggregate = aggregateChecklistScores(results);
  assert.equal(aggregate.sampleSize, 2);
  assert.equal(aggregate.averageCoverageRate, (1 + 0) / 2);
  assert.equal(aggregate.averageConstraintSatisfactionRate, (1 + 0) / 2);
  assert.equal(aggregate.totalConstraintPoints, 6);
});

test("aggregateChecklistScores handles empty result set without dividing by zero", () => {
  const aggregate = aggregateChecklistScores([]);
  assert.equal(aggregate.sampleSize, 0);
  assert.equal(aggregate.averageCoverageRate, 0);
  assert.equal(aggregate.averageConstraintSatisfactionRate, null);
});
