import assert from "node:assert/strict";
import test from "node:test";
import { createAblationExecutionAuthorizationTemplate } from "./ablation-authorization-template";
import { createAblationRunPlan } from "./ablation-protocol";
import { validateLightweightCaseManifest } from "./lightweight-case-manifest";

function plan() {
  return createAblationRunPlan(validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-08-01T00:00:00+08:00",
    cases: Array.from({ length: 20 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "Build a requirement planning case with roles, scope, constraints, acceptance criteria, audit records, error handling, and operations.",
      checklist: Array.from({ length: 5 }, (_, point) => ({
        id: `point-${point + 1}`,
        description: `Checklist point ${point + 1}`,
        keywords: [`keyword-${point + 1}`],
        isConstraint: false,
      })),
    })),
  }), 1, 20260801);
}

test("授权模板绑定冻结计划和最低协议储备，但保持 pending", () => {
  const template = createAblationExecutionAuthorizationTemplate({ plan: plan(), model: "LongCat-2.0", temperature: 0.3 });
  assert.equal(template.status, "pending");
  assert.equal(template.approvedBy, "<待负责人填写>");
  assert.equal(template.caseManifestSha256.length, 64);
  assert.equal(template.runPlanSha256.length, 64);
  assert.equal(template.maxTotalCostUsd, 54.984);
  assert.equal(template.maxCostUsdPerRun, 1.0902);
});

test("授权模板拒绝无效 token 上限和温度", () => {
  assert.throws(() => createAblationExecutionAuthorizationTemplate({ plan: plan(), maxOutputTokensPerCall: 0 }), /ABLATION_AUTHORIZATION_TEMPLATE_OUTPUT_TOKEN_LIMIT_INVALID/);
  assert.throws(() => createAblationExecutionAuthorizationTemplate({ plan: plan(), temperature: 2.1 }), /ABLATION_AUTHORIZATION_TEMPLATE_TEMPERATURE_INVALID/);
});

test("24 案例五轮冻结计划的模板预算覆盖全部 480 条运行", () => {
  const fixture = validateLightweightCaseManifest({
    schemaVersion: 1,
    protocolVersion: "fixture-v1",
    frozenAt: "2026-08-01T00:00:00+08:00",
    cases: Array.from({ length: 24 }, (_, index) => ({
      caseId: `lw-case-${String(index + 1).padStart(2, "0")}`,
      category: "website",
      complexity: "medium",
      requirement: "Build a requirement planning case with roles, scope, constraints, acceptance criteria, audit records, error handling, and operations.",
      checklist: Array.from({ length: 5 }, (_, point) => ({
        id: `point-${point + 1}`,
        description: `Checklist point ${point + 1}`,
        keywords: [`keyword-${point + 1}`],
        isConstraint: false,
      })),
    })),
  });
  const template = createAblationExecutionAuthorizationTemplate({
    plan: createAblationRunPlan(fixture, 5, 20260801),
    model: "LongCat-2.0",
    temperature: 0.3,
  });

  assert.equal(template.maxCostUsdPerRun, 1.0902);
  assert.equal(template.maxTotalCostUsd, 329.904);
});
