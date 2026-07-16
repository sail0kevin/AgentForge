import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRequirementBaseline, createBaselinePlan } from "./baseline-planner";
import { RequirementAnalysisSchema } from "./contracts";
import { DEFAULT_PLANNER_BUDGET, planRequirement } from "./planner-service";
import { StructuredOutputError, generateStructuredOutput } from "./structured-output";
import { validateExecutionPlan } from "./validation";
import { buildExecutionPlanPrompt } from "./prompts";

const fixtures = {
  website: "为一家设计工作室建设响应式品牌官网，面向潜在客户，展示案例、服务和联系方式，并重视 SEO。",
  admin: "开发一个给运营管理员使用的订单管理后台，需要角色权限、查询筛选、状态流转和审计记录。",
  learning: "为学生开发学习计划工具，支持任务拆分、番茄计时、进度统计和每周复盘。",
};

test("website, admin and learning requirements produce different report outlines", async () => {
  const results = await Promise.all(Object.values(fixtures).map((requirement) => planRequirement({ requirement })));
  for (const result of results) assert.equal(result.status, "ready");
  const outlines = results.map((result) => result.status === "ready" ? result.reportOutline.map((section) => section.id).join(",") : "");
  assert.equal(new Set(outlines).size, 3);
  assert.match(outlines[0], /information-architecture/);
  assert.match(outlines[1], /roles-permissions/);
  assert.match(outlines[2], /timer-state/);
});

test("critical missing information produces an explainable clarification request", async () => {
  const result = await planRequirement({ requirement: "做个网页" });
  assert.equal(result.status, "needs_clarification");
  if (result.status === "needs_clarification") {
    assert.ok(result.clarification.questions.some((item) => item.id === "business-goal"));
    assert.ok(result.clarification.questions.some((item) => item.id === "target-users"));
  }
});

test("semantic validation rejects unauthorized tools, cycles and over-budget plans", () => {
  const analysis = analyzeRequirementBaseline(fixtures.admin);
  const unsafe = structuredClone(createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET));
  unsafe.tasks[0].toolIds = ["shell-admin"];
  unsafe.tasks[0].dependsOn = [unsafe.tasks.at(-1)!.id];
  unsafe.estimatedTotalTokens = DEFAULT_PLANNER_BUDGET.maxTokens + 1;
  unsafe.estimatedCostUsd = DEFAULT_PLANNER_BUDGET.maxCostUsd + 1;
  const result = validateExecutionPlan(unsafe, DEFAULT_PLANNER_BUDGET);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("unauthorized tool")));
  assert.ok(result.issues.some((issue) => issue.includes("cycle")));
  assert.ok(result.issues.some((issue) => issue.includes("budget allows")));
});

test("structured output retries once and accepts a corrected JSON object", async () => {
  const valid = analyzeRequirementBaseline(fixtures.website);
  let calls = 0;
  const result = await generateStructuredOutput({
    schema: RequirementAnalysisSchema,
    prompt: "analyze",
    generate: async () => (++calls === 1 ? "not-json" : JSON.stringify(valid)),
    maxAttempts: 2,
  });
  assert.equal(calls, 2);
  assert.equal(result.projectType, "website");
});

test("invalid structured plans stop after the configured attempt limit", async () => {
  const validAnalysis = analyzeRequirementBaseline(fixtures.website);
  let planCalls = 0;
  await assert.rejects(
    planRequirement({
      requirement: fixtures.website,
      maxAttempts: 2,
      generate: async ({ stage }) => {
        if (stage === "analysis") return JSON.stringify(validAnalysis);
        planCalls += 1;
        const plan = createBaselinePlan(validAnalysis, DEFAULT_PLANNER_BUDGET);
        plan.tasks[0].toolIds = ["root-shell"];
        return JSON.stringify(plan);
      },
    }),
    (error) => error instanceof StructuredOutputError && error.attempts === 2,
  );
  assert.equal(planCalls, 2);
});

test("model prompt contains the current machine-readable contract and budget", () => {
  const analysis = analyzeRequirementBaseline(fixtures.website);
  const prompt = buildExecutionPlanPrompt(analysis, DEFAULT_PLANNER_BUDGET);
  assert.match(prompt, /estimatedCostUsd/);
  assert.match(prompt, /reportSections/);
  assert.match(prompt, /60000/);
});
