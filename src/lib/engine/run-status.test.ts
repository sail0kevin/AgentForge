import assert from "node:assert/strict";
import test from "node:test";
import { resolveRunCompletionStatus } from "./run-status";

test("全部 Agent 成功时正常完成", () => {
  assert.equal(
    resolveRunCompletionStatus({ budgetStatus: "idle", hadAgentFailure: false }),
    "idle"
  );
});

test("任一 Agent 失败后，后续成功不能覆盖 warning", () => {
  assert.equal(
    resolveRunCompletionStatus({ budgetStatus: "idle", hadAgentFailure: true }),
    "warning"
  );
});

test("最后一个 Agent 失败时返回 warning", () => {
  assert.equal(
    resolveRunCompletionStatus({ budgetStatus: "running", hadAgentFailure: true }),
    "warning"
  );
});

test("全部 Agent 失败时返回 warning", () => {
  assert.equal(
    resolveRunCompletionStatus({ budgetStatus: "warning", hadAgentFailure: true }),
    "warning"
  );
});

test("预算耗尽优先于 Agent 失败", () => {
  assert.equal(
    resolveRunCompletionStatus({ budgetStatus: "exhausted", hadAgentFailure: true }),
    "exhausted"
  );
});
