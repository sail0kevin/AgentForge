import assert from "node:assert/strict";
import test from "node:test";
import {
  SCORING_LANGUAGE_MIN_SHARE_FACTOR,
  checkScoringLanguageConsistency,
  detectDominantScript,
  measureScriptShare,
} from "./scoring-language";

const CHINESE_KEYWORDS = ["多币种", "汇率", "结算货币", "关税", "清关", "物流"] as const;

test("measureScriptShare normalizes cjk and latin shares to sum to one", () => {
  const share = measureScriptShare("库存扣减 stock deduction");
  assert.ok(share.cjk > 0 && share.latin > 0);
  assert.ok(Math.abs(share.cjk + share.latin - 1) < 1e-12);
});

test("measureScriptShare weights ideographs above raw latin letter counts", () => {
  // 4 个汉字 vs 10 个拉丁字母：按原始字符数英文会胜出，按信息密度折算后中文仍占主导。
  const share = measureScriptShare("库存扣减 stockonly");
  assert.ok(share.cjk > share.latin);
});

test("measureScriptShare ignores punctuation, digits, and whitespace", () => {
  const share = measureScriptShare("—— 123 ，。！ \n\t");
  assert.deepEqual(share, { cjk: 0, latin: 0 });
});

test("detectDominantScript returns null when no scoreable script is present", () => {
  assert.equal(detectDominantScript("2026-08-06 :: 42 %"), null);
});

test("detectDominantScript identifies each script family", () => {
  assert.equal(detectDominantScript("覆盖优惠券叠加规则与库存扣减"), "cjk");
  assert.equal(detectDominantScript("Cover coupon stacking rules and stock deduction"), "latin");
});

test("checkScoringLanguageConsistency accepts text in the keyword script", () => {
  const check = checkScoringLanguageConsistency({
    keywords: CHINESE_KEYWORDS,
    scoredText: "方案覆盖多币种展示与结算货币换算，说明关税与清关流程，并给出物流轨迹跟踪设计。",
  });
  assert.equal(check.expectedScript, "cjk");
  assert.equal(check.consistent, true);
  assert.ok(check.textShare >= check.requiredShare);
});

test("checkScoringLanguageConsistency rejects text that drifted out of the keyword script", () => {
  // 这是真实运行中 26 个 coverageRate=0.00 样本的形态：报告完整生成，但整段是英文。
  const check = checkScoringLanguageConsistency({
    keywords: CHINESE_KEYWORDS,
    scoredText: "The solution covers multi-currency settlement, customs clearance, and carrier tracking links.",
  });
  assert.equal(check.expectedScript, "cjk");
  assert.equal(check.consistent, false);
  assert.ok(check.textShare < check.requiredShare);
});

test("checkScoringLanguageConsistency rejects residual keyword sprinkles inside an otherwise drifted report", () => {
  // 漂移输出里常残留少量术语；仅凭"含中文"不足以认定可评分，占比必须达标。
  const check = checkScoringLanguageConsistency({
    keywords: CHINESE_KEYWORDS,
    scoredText: `Settlement design (结算货币) follows the delivery-first plan. ${"The gateway retries the pending charge and reconciles the ledger daily. ".repeat(12)}`,
  });
  assert.equal(check.consistent, false);
});

test("checkScoringLanguageConsistency is symmetric for latin keyword sets", () => {
  const latinKeywords = ["idempotency", "reconciliation", "settlement"] as const;
  const drifted = checkScoringLanguageConsistency({
    keywords: latinKeywords,
    scoredText: "方案覆盖幂等处理、对账流程与结算设计，并说明补偿事务。",
  });
  assert.equal(drifted.expectedScript, "latin");
  assert.equal(drifted.consistent, false);

  const aligned = checkScoringLanguageConsistency({
    keywords: latinKeywords,
    scoredText: "The plan covers idempotency keys, nightly reconciliation, and settlement batching.",
  });
  assert.equal(aligned.consistent, true);
});

test("checkScoringLanguageConsistency stays neutral when keywords carry no scoreable script", () => {
  const check = checkScoringLanguageConsistency({ keywords: ["2026", "99.9%"], scoredText: "任何文本" });
  assert.equal(check.expectedScript, null);
  assert.equal(check.consistent, true);
});

test("checkScoringLanguageConsistency reports the threshold it applied", () => {
  const check = checkScoringLanguageConsistency({ keywords: CHINESE_KEYWORDS, scoredText: "多币种结算" });
  assert.equal(check.requiredShare, check.expectedShare * SCORING_LANGUAGE_MIN_SHARE_FACTOR);
});

test("checkScoringLanguageConsistency treats empty scored text as inconsistent rather than passing it through", () => {
  const check = checkScoringLanguageConsistency({ keywords: CHINESE_KEYWORDS, scoredText: "" });
  assert.equal(check.consistent, false);
});
