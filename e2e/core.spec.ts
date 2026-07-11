import { expect, test, type APIRequestContext } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createAgent(request: APIRequestContext, provider: "openai" | "ollama", name: string) {
  const response = await request.post("/api/agents", {
    data: {
      name,
      avatar: "AI",
      color: "#38bdf8",
      provider,
      model: provider === "ollama" ? "missing-test-model" : "test-model",
      systemPrompt: "你是用于自动化验收的测试智能体。",
      temperature: 0.2,
      maxTokens: 128,
      capabilityIds: ["rag"],
      apiUrl: provider === "ollama" ? "http://127.0.0.1:1" : "",
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; credentialConfigured: boolean; maskedKey: string | null }>;
}

test("Agent DTO 和手动运行流不会泄露原始 API Key", async ({ request }) => {
  const rawKey = `sk-test-${unique()}`;
  const keyResponse = await request.post("/api/api-keys", { data: { provider: "openai", apiKey: rawKey } });
  expect(keyResponse.status()).toBe(201);

  const openAiAgent = await createAgent(request, "openai", `security-${unique()}`);
  expect(JSON.stringify(openAiAgent)).not.toContain(rawKey);
  expect(openAiAgent.credentialConfigured).toBeTruthy();

  const listResponse = await request.get("/api/agents");
  expect(listResponse.ok()).toBeTruthy();
  expect(await listResponse.text()).not.toContain(rawKey);

  // 运行流使用不可达的 Ollama 地址，避免测试调用真实收费 Provider，同时仍可检查 SSE 是否泄密。
  const runnableAgent = await createAgent(request, "ollama", `stream-${unique()}`);
  const runResponse = await request.post("/api/workspaces/manual/run", {
    data: { input: "测试凭证是否泄露", agentIds: [runnableAgent.id], useRag: false, knowledgeSnippets: [] },
  });
  expect(runResponse.ok()).toBeTruthy();
  expect(await runResponse.text()).not.toContain(rawKey);
});

test("多个 Agent 失败时仍按顺序继续并产生唯一终态", async ({ request }) => {
  const first = await createAgent(request, "ollama", `first-${unique()}`);
  const second = await createAgent(request, "ollama", `second-${unique()}`);

  const response = await request.post("/api/workspaces/manual/run", {
    data: { input: "顺序失败继续测试", agentIds: [first.id, second.id], useRag: false, knowledgeSnippets: [] },
  });
  expect(response.ok()).toBeTruthy();
  const stream = await response.text();

  const events = stream
    .split("\n\n")
    .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; agent?: { id: string }; error?: string });

  expect(events.filter((event) => event.type === "agent_started").map((event) => event.agent?.id)).toEqual([first.id, second.id]);
  expect(events.filter((event) => event.type === "agent_failed")).toHaveLength(2);
  expect(events.filter((event) => event.type === "run_completed")).toHaveLength(1);
});

test("消息历史可恢复且清空后不会复活", async ({ request }) => {
  const agent = await createAgent(request, "ollama", `history-${unique()}`);
  const marker = `history-${unique()}`;
  const runResponse = await request.post("/api/workspaces/manual/run", {
    data: { input: marker, agentIds: [agent.id], useRag: false, knowledgeSnippets: [] },
  });
  expect(runResponse.ok()).toBeTruthy();
  await runResponse.text();

  const before = await request.get("/api/workspaces/manual/messages");
  expect(await before.text()).toContain(marker);

  const clear = await request.delete("/api/workspaces/manual/messages");
  expect(clear.ok()).toBeTruthy();
  const after = await request.get("/api/workspaces/manual/messages");
  expect(await after.json()).toEqual([]);
});

test("主题和语言刷新后保持", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("multi-agent-workspace.theme.v1", "dark");
    localStorage.setItem("multi-agent-workspace.language.v1", "en");
  });
  await page.goto("/");
  await expect(page.locator(".theme-dark")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".theme-dark")).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("multi-agent-workspace.language.v1"))).toBe("en");
});
