import assert from "node:assert/strict";
import test from "node:test";
import { agentCreateSchema } from "./validation";

const agent = {
  name: "A", avatar: "AI", color: "#38bdf8", provider: "ollama", model: "qwen2.5:3b",
  temperature: 0.7, maxTokens: 1200, apiUrl: "", apiKey: "",
};

test("agent role prompt accepts any non-empty text and rejects only blank input", () => {
  assert.equal(agentCreateSchema.parse({ ...agent, systemPrompt: "你" }).systemPrompt, "你");
  assert.throws(() => agentCreateSchema.parse({ ...agent, systemPrompt: "   " }), /角色设定不能为空/);
});
