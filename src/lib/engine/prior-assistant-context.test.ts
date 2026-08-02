import assert from "node:assert/strict";
import test from "node:test";
import { limitPriorAssistantContext } from "./prior-assistant-context";

test("前序 Agent 上下文保留最新消息并维持时间顺序", () => {
  const result = limitPriorAssistantContext(
    ["a", "b", "c", "d"].map((agentName) => ({ agentName, content: `${agentName}-result` })),
    { maxMessages: 2, maxCharacters: 1_000, maxCharactersPerMessage: 100 },
  );

  assert.deepEqual(result, [
    { agentName: "c", content: "c-result" },
    { agentName: "d", content: "d-result" },
  ]);
});

test("前序 Agent 上下文截断超长单条输出并标记边界", () => {
  const result = limitPriorAssistantContext(
    [{ agentName: "planner", content: "a".repeat(100) }],
    { maxMessages: 8, maxCharacters: 1_000, maxCharactersPerMessage: 30 },
  );

  assert.equal(result[0]?.content.length, 30);
  assert.match(result[0]?.content ?? "", /前序 Agent 输出已截断/);
});

test("前序 Agent 上下文不超过总字符预算", () => {
  const result = limitPriorAssistantContext(
    [
      { agentName: "old", content: "a".repeat(40) },
      { agentName: "latest", content: "b".repeat(40) },
    ],
    { maxMessages: 8, maxCharacters: 75, maxCharactersPerMessage: 100 },
  );

  assert.deepEqual(result, [{ agentName: "latest", content: "b".repeat(40) }]);
});
