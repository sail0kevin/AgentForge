import assert from "node:assert/strict";
import test from "node:test";
import type { LLMMessage, LLMResult } from "@/lib/types";
import {
  createSingleAgentGraph,
  runSingleAgentGraph,
  type SingleAgentGraphInput,
} from "./single-agent";

const agent = {
  id: "agent-1",
  name: "需求分析师",
  avatar: "A",
  color: "blue",
  provider: "ollama" as const,
  model: "qwen2.5:3b",
  systemPrompt: "你负责分析需求。",
  temperature: 0.2,
  maxTokens: 512,
};

const input: SingleAgentGraphInput = {
  agent,
  input: "为学习计划应用生成开发方案",
  systemContext: "你负责分析需求。\n\n- 允许使用 RAG。",
  userId: "user-1",
  priorAssistantMessages: [
    { agentName: "产品研究员", content: "用户需要任务、计时和统计功能。" },
  ],
};

const result: LLMResult = {
  content: "这是结构化开发方案。",
  inputTokens: 12,
  outputTokens: 8,
};

test("单 Agent 图按检索后调用模型，并传递上下文和前序 Agent 归因", async () => {
  const calls: string[] = [];
  let receivedMessages: LLMMessage[] = [];

  const graphResult = await runSingleAgentGraph(
    {
      retrieveContext: async (receivedInput) => {
        calls.push("retrieve");
        assert.equal(receivedInput.userId, "user-1");
        assert.equal(receivedInput.input, input.input);
        return "学习产品应提供可执行的每日任务。";
      },
      invokeAgent: async ({ messages }) => {
        calls.push("invoke");
        receivedMessages = messages;
        return result;
      },
    },
    input
  );

  assert.deepEqual(calls, ["retrieve", "invoke"]);
  assert.equal(receivedMessages[0]?.role, "system");
  assert.match(receivedMessages[0]?.content ?? "", /允许使用 RAG/);
  assert.match(receivedMessages[0]?.content ?? "", /检索到的参考资料/);
  assert.match(receivedMessages[0]?.content ?? "", /每日任务/);
  assert.deepEqual(receivedMessages[1], { role: "user", content: input.input });
  assert.deepEqual(receivedMessages[2], {
    role: "user",
    content: "[Previous agent 产品研究员]: 用户需要任务、计时和统计功能。",
  });
  assert.deepEqual(graphResult, {
    ...result,
    retrievedContext: "学习产品应提供可执行的每日任务。",
  });
});

test("空检索不会把空参考资料提示注入模型上下文", async () => {
  let receivedMessages: LLMMessage[] = [];

  await runSingleAgentGraph(
    {
      retrieveContext: async () => "",
      invokeAgent: async ({ messages }) => {
        receivedMessages = messages;
        return result;
      },
    },
    { ...input, priorAssistantMessages: [] }
  );

  assert.equal(receivedMessages[0]?.content, input.systemContext);
  assert.equal(receivedMessages.length, 2);
});

test("图实例不共享检索或模型依赖", async () => {
  const first = createSingleAgentGraph({
    retrieveContext: async () => "first-context",
    invokeAgent: async () => ({ ...result, content: "first-result" }),
  });
  const second = createSingleAgentGraph({
    retrieveContext: async () => "second-context",
    invokeAgent: async () => ({ ...result, content: "second-result" }),
  });

  const [firstState, secondState] = await Promise.all([
    first.invoke({ ...input, priorAssistantMessages: [] }),
    second.invoke({ ...input, priorAssistantMessages: [] }),
  ]);

  assert.equal(firstState.retrievedContext, "first-context");
  assert.equal(firstState.result?.content, "first-result");
  assert.equal(secondState.retrievedContext, "second-context");
  assert.equal(secondState.result?.content, "second-result");
});

test("无效输入不会调用任何依赖", async () => {
  let dependencyCalled = false;

  await assert.rejects(
    () =>
      runSingleAgentGraph(
        {
          retrieveContext: async () => {
            dependencyCalled = true;
            return "context";
          },
          invokeAgent: async () => {
            dependencyCalled = true;
            return result;
          },
        },
        { ...input, input: "   " }
      ),
    /Too small/
  );

  assert.equal(dependencyCalled, false);
});

test("检索或模型错误会停止图并传递给调用方", async () => {
  let modelCalled = false;

  await assert.rejects(
    () =>
      runSingleAgentGraph(
        {
          retrieveContext: async () => {
            throw new Error("retrieval unavailable");
          },
          invokeAgent: async () => {
            modelCalled = true;
            return result;
          },
        },
        input
      ),
    /retrieval unavailable/
  );
  assert.equal(modelCalled, false);

  await assert.rejects(
    () =>
      runSingleAgentGraph(
        {
          retrieveContext: async () => "context",
          invokeAgent: async () => {
            throw new Error("provider unavailable");
          },
        },
        input
      ),
    /provider unavailable/
  );
});

test("模型返回不完整 token 数据时拒绝结果", async () => {
  await assert.rejects(
    () =>
      runSingleAgentGraph(
        {
          retrieveContext: async () => "context",
          invokeAgent: async () => ({ content: "bad" } as LLMResult),
        },
        input
      ),
    /inputTokens/
  );
});
