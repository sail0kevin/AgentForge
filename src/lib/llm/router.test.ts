import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { AgentConfig, LLMMessage } from "@/lib/types";
import { callLLMWithApiKey } from "./router";

const messages: LLMMessage[] = [
  { role: "system", content: "你是测试智能体。" },
  { role: "user", content: "等待测试服务响应。" },
];

function agent(provider: AgentConfig["provider"]): AgentConfig {
  return {
    id: `agent-${provider}`,
    name: `测试 ${provider}`,
    avatar: "AI",
    color: "#38bdf8",
    provider,
    model: "test-model",
    systemPrompt: "你是测试智能体。",
    temperature: 0.2,
    maxTokens: 128,
  };
}

async function withDelayedServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer((_request, response) => {
    setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    }, 500);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

for (const provider of ["ollama", "custom", "anthropic"] as const) {
  test(`${provider} 调用超过统一时限后返回 PROVIDER_TIMEOUT`, async () => {
    await withDelayedServer(async (baseUrl) => {
      await assert.rejects(
        () => callLLMWithApiKey({ agent: agent(provider), messages, apiKey: "test-api-key", baseUrl, timeoutMs: 30 }),
        /PROVIDER_TIMEOUT/
      );
    });
  });
}

test("上层取消信号会停止 Provider 请求并返回 RUN_CANCELLED", async () => {
  await withDelayedServer(async (baseUrl) => {
    const controller = new AbortController();
    const pending = callLLMWithApiKey({
      agent: agent("ollama"),
      messages,
      baseUrl,
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    setTimeout(() => controller.abort(new Error("RUN_CANCELLED")), 30);
    await assert.rejects(() => pending, /RUN_CANCELLED/);
  });
});
