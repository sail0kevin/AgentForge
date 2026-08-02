import assert from "node:assert/strict";
import test from "node:test";
import { calculateCost, LONGCAT_STANDARD_PRICING } from "./billing";

test("LongCat-2.0 uses the published standard pricing", () => {
  const cost = calculateCost("LongCat-2.0", 1_000_000, 1_000_000);
  assert.equal(cost.costUsd, 3.7);
  assert.equal(LONGCAT_STANDARD_PRICING.inputUsdPerMillion, 0.75);
  assert.equal(LONGCAT_STANDARD_PRICING.outputUsdPerMillion, 2.95);
});

test("unknown models retain the default pricing", () => {
  assert.equal(calculateCost("unknown-test-model", 1_000_000, 1_000_000).costUsd, 4);
});
