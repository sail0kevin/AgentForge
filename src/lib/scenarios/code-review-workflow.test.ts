import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCodeReviewScope, analyzeCodeSnapshot, runCodeReviewWorkflow } from "./code-review-workflow";

test("code review workflow records the declared review goal and direct-evidence boundary", async () => {
  const report = await runCodeReviewWorkflow({
    reviewGoal: "检查发布前的凭证与动态执行风险",
    files: [
      { path: "src/z.ts", content: "export const z = true;" },
      { path: "src/a.ts", content: "export const a = true;" },
    ],
  });
  assert.deepEqual(report.analysisScope, {
    reviewGoal: "检查发布前的凭证与动态执行风险",
    filesInScope: ["src/a.ts", "src/z.ts"],
    evidenceBoundary: "direct_source_text_patterns_only",
  });
});

test("code review workflow reports directly evidenced findings with stable file and line provenance", async () => {
  const report = await runCodeReviewWorkflow({ files: [
    { path: "src/unsafe.ts", content: "const apiKey = 'abc123456789';\nconsole.log(apiKey);\neval(input);" },
  ] });
  assert.equal(report.status, "needs_attention");
  assert.equal(report.filesAnalyzed, 1);
  assert.deepEqual(report.findings.map((finding) => [finding.rule, finding.line]), [
    ["possible_secret", 1], ["debug_console", 2], ["unsafe_dynamic_execution", 3],
  ]);
  assert.deepEqual(report.suggestions.map((suggestion) => suggestion.orientation), ["minimal_change", "defense_in_depth"]);
});

test("code review workflow does not invent findings for a clean snapshot", async () => {
  const report = await runCodeReviewWorkflow({ files: [
    { path: "src/safe.ts", content: "export function add(left: number, right: number) { return left + right; }" },
  ] });
  assert.equal(report.status, "clean");
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.suggestions, []);
});

test("static analysis output is deterministic across input file ordering", () => {
  const files = [
    { path: "z.ts", content: "console.debug('z');" },
    { path: "a.ts", content: "console.log('a');" },
  ];
  assert.deepEqual(analyzeCodeSnapshot(files), analyzeCodeSnapshot([...files].reverse()));
  assert.deepEqual(analyzeCodeReviewScope({ files }), analyzeCodeReviewScope({ files: [...files].reverse() }));
});
