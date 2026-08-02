import { expect, test, type APIRequestContext } from "@playwright/test";
import { createServer } from "node:http";
import { analyzeRequirementBaseline, createBaselinePlan } from "../src/lib/planner/baseline-planner";
import { DEFAULT_PLANNER_BUDGET } from "../src/lib/planner/planner-service";
import { createBaselineDevelopmentReport } from "../src/lib/report/report-service";
import { buildRubric, createBaselineCandidate, createBaselineReview, evaluateBaseline } from "../src/lib/review/review-service";

const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function createAgent(request: APIRequestContext, provider: "openai" | "ollama", name: string, apiUrl?: string, apiKey?: string) {
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
      apiUrl: apiUrl ?? (provider === "ollama" ? "http://127.0.0.1:1" : ""),
      apiKey,
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; credentialConfigured: boolean; maskedKey: string | null }>;
}

async function uploadDocument(request: APIRequestContext, name: string, buffer: Buffer, metadata: Record<string, string> = {}) {
  return request.post("/api/documents", {
    multipart: { file: { name, mimeType: "text/plain; charset=utf-8", buffer }, ...metadata },
  });
}

async function startDelayedOllamaServer(delayMs = 1_500) {
  let resolveRequestReceived: (() => void) | undefined;
  let resolveRequestClosed: (() => void) | undefined;
  const requestReceived = new Promise<void>((resolve) => { resolveRequestReceived = resolve; });
  const requestClosed = new Promise<void>((resolve) => { resolveRequestClosed = resolve; });
  const server = createServer((request, response) => {
    resolveRequestReceived?.();
    request.once("close", () => resolveRequestClosed?.());
    setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: { content: "late response" }, prompt_eval_count: 1, eval_count: 1 }));
    }, delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requestReceived,
    requestClosed,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function startInvalidPlannerServer() {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: { content: "this is not JSON" }, prompt_eval_count: 8, eval_count: 4 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function startSuccessfulWorkflowServer(requirement: string) {
  const analysis = analyzeRequirementBaseline(requirement);
  const plan = createBaselinePlan(analysis, DEFAULT_PLANNER_BUDGET);
  const delivery = createBaselineCandidate(plan, "delivery");
  const quality = createBaselineCandidate(plan, "quality");
  const candidates = [delivery, quality];
  const review = createBaselineReview(candidates);
  const evaluation = evaluateBaseline(candidates, review, buildRubric(plan));
  let requests = 0;
  const server = createServer(async (request, response) => {
    requests += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages?: Array<{ content?: string }> };
    const system = body.messages?.[0]?.content ?? "";
    const prompt = body.messages?.at(-1)?.content ?? "";
    let content: unknown;
    if (system.includes("当前节点：analysis")) content = analysis;
    else if (system.includes("当前节点：plan")) content = plan;
    else if (prompt.includes("independent delivery candidate")) content = delivery;
    else if (prompt.includes("independent quality candidate")) content = quality;
    else if (prompt.includes("Cross-review every candidate")) content = review;
    else if (prompt.includes("Act as Evaluator")) content = evaluation;
    else if (prompt.includes("Validated source chain:")) {
      const sourceJson = prompt.slice(prompt.lastIndexOf("Validated source chain:") + "Validated source chain:".length).trim();
      content = createBaselineDevelopmentReport(JSON.parse(sourceJson) as Parameters<typeof createBaselineDevelopmentReport>[0]);
    } else content = { error: "UNRECOGNIZED_TEST_PROMPT" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: { content: JSON.stringify(content) }, prompt_eval_count: 30, eval_count: 20 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("Agent DTO 和手动运行流不会泄露原始 API Key", async ({ request }) => {
  const rawKey = `sk-test-${unique()}`;
  const keyResponse = await request.post("/api/api-keys", { data: { provider: "openai", apiKey: rawKey } });
  expect(keyResponse.status()).toBe(201);

  const openAiAgent = await createAgent(request, "openai", `security-${unique()}`);
  expect(JSON.stringify(openAiAgent)).not.toContain(rawKey);
  expect(openAiAgent.credentialConfigured).toBeTruthy();

  const apiKeyListResponse = await request.get("/api/api-keys");
  expect(apiKeyListResponse.ok()).toBeTruthy();
  const apiKeyList = await apiKeyListResponse.json() as Array<{ source: string; agentName?: string; maskedKey: string }>;
  expect(apiKeyList.some((key) => key.source === "provider")).toBeTruthy();

  const listResponse = await request.get("/api/agents");
  expect(listResponse.ok()).toBeTruthy();
  expect(await listResponse.text()).not.toContain(rawKey);

  // 运行流使用不可达的 Ollama 地址，避免测试调用真实收费 Provider，同时仍可检查 SSE 是否泄密。
  const runnableAgentName = `stream-${unique()}`;
  const agentKey = `agent-key-${unique()}`;
  const runnableAgent = await createAgent(request, "ollama", runnableAgentName, undefined, agentKey);
  const agentListAfterSave = await (await request.get("/api/agents")).json() as Array<{ id: string; name: string; keyLength: number; credentialConfigured: boolean }>;
  const savedAgent = agentListAfterSave.find((agent) => agent.id === runnableAgent.id);
  expect(savedAgent).toMatchObject({ name: runnableAgentName, keyLength: agentKey.length, credentialConfigured: true });
  const apiKeysAfterAgentSave = await (await request.get("/api/api-keys")).json() as Array<{ source: string; agentName?: string; maskedKey: string }>;
  expect(apiKeysAfterAgentSave.some((key) => key.source === "agent" && key.agentName === runnableAgentName && key.maskedKey.includes("****"))).toBeTruthy();
  expect(JSON.stringify(apiKeysAfterAgentSave)).not.toContain(agentKey);
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
    .map((line) => JSON.parse(line.slice(6)) as { version?: number; type: string; runId?: string; agent?: { id: string }; error?: string; budgetStatus?: string });

  const runCreatedEvents = events.filter((event) => event.type === "run_created");
  expect(runCreatedEvents).toHaveLength(1);
  const runId = runCreatedEvents[0]?.runId;
  expect(runId).toBeTruthy();
  expect(events.filter((event) => event.type === "agent_started").map((event) => event.agent?.id)).toEqual([first.id, second.id]);
  expect(events.filter((event) => event.type === "agent_failed")).toHaveLength(2);
  const terminalEvents = events.filter((event) => event.type === "run_completed");
  expect(terminalEvents).toHaveLength(1);
  expect(terminalEvents[0]?.budgetStatus).toBe("warning");
  expect(terminalEvents[0]?.runId).toBe(runId);
  expect(events.filter((event) => event.type === "agent_started" || event.type === "agent_failed").every((event) => event.runId === runId)).toBeTruthy();
  expect(events.every((event) => event.version === 1 && event.runId === runId)).toBeTruthy();
});

test("同一用户的并发手动运行会被拒绝或由服务端锁串行化", async ({ request }) => {
  const agents = await Promise.all(
    Array.from({ length: 6 }, (_, index) => createAgent(request, "ollama", `lock-${index}-${unique()}`))
  );
  const payload = { input: "并发锁测试", agentIds: agents.map((agent) => agent.id), useRag: false, knowledgeSnippets: [] };

  const responses = await Promise.all([
    request.post("/api/workspaces/manual/run", { data: payload }),
    request.post("/api/workspaces/manual/run", { data: payload }),
  ]);
  const streams = await Promise.all(responses.map((response) => response.text()));
  const combined = streams.join("\n");
  const eventsByResponse = streams.map((stream) =>
    stream
      .split("\n\n")
      .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
      .filter((line): line is string => Boolean(line))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; code?: string; startedAt?: string; finishedAt?: string })
  );

  expect(responses.every((response) => response.ok())).toBeTruthy();
  const rejectedCount = (combined.match(/"code":"WORKSPACE_ALREADY_RUNNING"/g) ?? []).length;
  const intervals = eventsByResponse
    .map((events) => ({
      startedAt: events.find((event) => event.type === "run_created")?.startedAt,
      finishedAt: events.find((event) => event.type === "run_completed")?.finishedAt,
    }))
    .filter((interval): interval is { startedAt: string; finishedAt: string } => Boolean(interval.startedAt && interval.finishedAt))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  if (rejectedCount === 1) {
    expect(intervals).toHaveLength(1);
  } else {
    expect(rejectedCount).toBe(0);
    expect(intervals).toHaveLength(2);
    expect(new Date(intervals[0].finishedAt).getTime()).toBeLessThanOrEqual(new Date(intervals[1].startedAt).getTime());
  }
});

test("Provider 超时会停止本轮运行且不再启动后续 Agent", async ({ request }) => {
  const delayed = await startDelayedOllamaServer();
  try {
    const first = await createAgent(request, "ollama", `timeout-${unique()}`, delayed.url);
    const second = await createAgent(request, "ollama", `must-not-start-${unique()}`);
    const response = await request.post("/api/workspaces/manual/run", {
      data: { input: "超时后停止后续智能体", agentIds: [first.id, second.id], useRag: false, knowledgeSnippets: [] },
    });
    const stream = await response.text();
    const events = stream
      .split("\n\n")
      .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
      .filter((line): line is string => Boolean(line))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; agent?: { id: string }; error?: string; errorCode?: string });

    expect(events.filter((event) => event.type === "agent_started").map((event) => event.agent?.id)).toEqual([first.id]);
    expect(events.find((event) => event.type === "agent_failed")?.error).toBe("PROVIDER_TIMEOUT");
    expect(events.find((event) => event.type === "run_completed")?.errorCode).toBe("PROVIDER_TIMEOUT");
  } finally {
    await delayed.close();
  }
});

test("客户端取消 SSE 后会中止正在等待的 Provider 请求并释放运行锁", async ({ request }) => {
  const delayed = await startDelayedOllamaServer(5_000);
  try {
    const slow = await createAgent(request, "ollama", `cancel-${unique()}`, delayed.url);
    const response = await fetch("http://127.0.0.1:3110/api/workspaces/manual/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "客户端取消测试", agentIds: [slow.id], useRag: false, knowledgeSnippets: [] }),
    });
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes('"type":"agent_started"')) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      received += decoder.decode(chunk.value, { stream: true });
    }
    await delayed.requestReceived;
    await reader?.cancel();

    await Promise.race([
      delayed.requestClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Provider request was not aborted")), 2_000)),
    ]);

    const followUp = await createAgent(request, "ollama", `after-cancel-${unique()}`);
    const followUpResponse = await request.post("/api/workspaces/manual/run", {
      data: { input: "取消后再次运行", agentIds: [followUp.id], useRag: false, knowledgeSnippets: [] },
    });
    expect(await followUpResponse.text()).not.toContain("WORKSPACE_ALREADY_RUNNING");
  } finally {
    await delayed.close();
  }
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
  const beforeMessages = await before.json() as Array<{ content: string; runId?: string }>;
  const persistedUserMessage = beforeMessages.find((message) => message.content === marker);
  expect(persistedUserMessage?.runId).toBeTruthy();

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

test("中文文档按 UTF-8 字节计量并原子创建 Document/Chunk", async ({ request }) => {
  const content = Buffer.from("# 项目说明\n这是中文知识资料。\n第二行用于验证字节长度。", "utf8");
  const response = await uploadDocument(request, `chinese-${unique()}.md`, content);
  expect(response.status()).toBe(201);
  const document = await response.json() as { size: number; _count: { chunks: number } };
  expect(document.size).toBe(content.byteLength);
  expect(document._count.chunks).toBeGreaterThan(0);
});

test("超限文件在读取和写库前以稳定 413 错误拒绝", async ({ request }) => {
  const before = await request.get("/api/documents");
  const beforeCount = (await before.json() as unknown[]).length;
  const response = await uploadDocument(request, `oversize-${unique()}.txt`, Buffer.alloc(5 * 1024 * 1024 + 1, 0x61));
  expect(response.status()).toBe(413);
  expect(await response.json()).toMatchObject({ error: { code: "FILE_TOO_LARGE" } });
  const after = await request.get("/api/documents");
  expect((await after.json() as unknown[]).length).toBe(beforeCount);
});

test("无效 UTF-8 或超量切块失败后不留下半写入文档", async ({ request }) => {
  const before = await request.get("/api/documents");
  const beforeCount = (await before.json() as unknown[]).length;

  const invalidUtf8 = await uploadDocument(request, `invalid-${unique()}.txt`, Buffer.from([0xc3, 0x28]));
  expect(invalidUtf8.status()).toBe(422);
  expect(await invalidUtf8.json()).toMatchObject({ error: { code: "INVALID_UTF8" } });

  const tooManyChunksContent = Buffer.from(Array.from({ length: 2_001 }, () => "x".repeat(800)).join("\n"), "utf8");
  const tooManyChunks = await uploadDocument(request, `chunks-${unique()}.txt`, tooManyChunksContent);
  expect(tooManyChunks.status()).toBe(422);
  expect(await tooManyChunks.json()).toMatchObject({ error: { code: "TOO_MANY_CHUNKS" } });

  const after = await request.get("/api/documents");
  expect((await after.json() as unknown[]).length).toBe(beforeCount);
});

test("创建 Workspace 会原子绑定 agentIds，并拒绝跨归属或重复 Agent", async ({ request }) => {
  const first = await createAgent(request, "ollama", `workspace-agent-a-${unique()}`);
  const second = await createAgent(request, "ollama", `workspace-agent-b-${unique()}`);
  const before = await request.get("/api/workspaces");
  const beforeCount = (await before.json() as unknown[]).length;

  const create = await request.post("/api/workspaces", {
    data: { name: `bound-workspace-${unique()}`, description: "atomic agent binding", mode: "sequential", budgetLimit: 10, agentIds: [second.id, first.id] },
  });
  expect(create.status()).toBe(201);
  const workspace = await create.json() as { id: string; agents: Array<{ id: string }> };
  expect(workspace.agents.map((agent) => agent.id)).toEqual([second.id, first.id]);
  const stored = await request.get(`/api/workspaces/${workspace.id}`);
  expect((await stored.json() as { agents: Array<{ id: string }> }).agents.map((agent) => agent.id)).toEqual([second.id, first.id]);

  const missing = await request.post("/api/workspaces", {
    data: { name: "must-not-exist", mode: "sequential", budgetLimit: 10, agentIds: [`missing-${unique()}`] },
  });
  expect(missing.status()).toBe(404);
  const duplicate = await request.post("/api/workspaces", {
    data: { name: "duplicate-must-not-exist", mode: "sequential", budgetLimit: 10, agentIds: [first.id, first.id] },
  });
  expect(duplicate.status()).toBe(400);
  const after = await request.get("/api/workspaces");
  expect((await after.json() as unknown[]).length).toBe(beforeCount + 1);
});

test("持久工作区使用统一 v1 事件契约、Run锁和唯一终态", async ({ request }) => {
  const first = await createAgent(request, "ollama", `persistent-a-${unique()}`);
  const second = await createAgent(request, "ollama", `persistent-b-${unique()}`);
  const workspaceResponse = await request.post("/api/workspaces", { data: { name: `workspace-${unique()}`, description: "contract", mode: "sequential", budgetLimit: 10 } });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json() as { id: string };
  for (const [index, agentRecord] of [first, second].entries()) {
    const attach = await request.post(`/api/workspaces/${workspace.id}/agents`, { data: { agentId: agentRecord.id, sortOrder: index } });
    expect(attach.status()).toBe(201);
  }

  const response = await request.post(`/api/workspaces/${workspace.id}/run`, { data: { input: "统一持久入口契约" } });
  expect(response.ok()).toBeTruthy();
  const events = (await response.text()).split("\n\n")
    .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { version?: number; type: string; runId?: string; budgetStatus?: string });
  const runId = events.find((event) => event.type === "run_created")?.runId;
  expect(runId).toBeTruthy();
  expect(events.every((event) => event.version === 1 && event.runId === runId)).toBeTruthy();
  expect(events.filter((event) => event.type === "workspace_loaded")).toHaveLength(1);
  expect(events.filter((event) => event.type === "agent_started")).toHaveLength(2);
  expect(events.filter((event) => event.type === "run_completed")).toHaveLength(1);
  expect(events.find((event) => event.type === "run_completed")?.budgetStatus).toBe("warning");

  const snapshotResponse = await request.get(`/api/workspaces/${workspace.id}`);
  const snapshot = await snapshotResponse.json() as { status: string; messages: Array<{ runId?: string }> };
  expect(snapshot.status).toBe("warning");
  expect(snapshot.messages.length).toBe(3);
  expect(snapshot.messages.every((message) => message.runId === runId)).toBeTruthy();
});

test("Demo 使用同一 RunService 的内存适配器和 v1 契约", async ({ request }) => {
  const response = await request.post("/api/workspaces/demo/run", { data: { input: "Demo contract" } });
  expect(response.ok()).toBeTruthy();
  const events = (await response.text()).split("\n\n")
    .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { version?: number; type: string; runId?: string });
  const runId = events.find((event) => event.type === "run_created")?.runId;
  expect(runId).toBeTruthy();
  expect(events.every((event) => event.version === 1 && event.runId === runId)).toBeTruthy();
  expect(events.map((event) => event.type)).toEqual(["run_created", "workspace_loaded", "user_message_created", "run_completed"]);
});

test("Planner 为不同项目生成动态目录并以同一 runId 持久化", async ({ request }) => {
  const requirements = [
    "为设计工作室建设响应式官网，面向潜在客户展示案例、服务和联系方式，并重视 SEO。",
    "为运营管理员开发订单管理后台，需要角色权限、状态流转、审计和查询筛选。",
    "为学生开发学习计划工具，支持任务拆分、番茄计时、进度统计和每周复盘。",
  ];
  const responses = [];
  for (const requirement of requirements) responses.push(await request.post("/api/plans", { data: { requirement } }));
  expect(responses.map((response) => response.status())).toEqual([201, 201, 201]);
  const plans = await Promise.all(responses.map((response) => response.json() as Promise<{ runId: string; status: string; reportOutline: Array<{ id: string }> }>));
  expect(new Set(plans.map((plan) => plan.reportOutline.map((section) => section.id).join(","))).size).toBe(3);

  const listResponse = await request.get("/api/plans");
  expect(listResponse.ok()).toBeTruthy();
  const stored = await listResponse.json() as { plans: Array<{ runId: string; status: string; analysis: unknown; plan: unknown; reportOutline: unknown }> };
  for (const plan of plans) {
    const artifact = stored.plans.find((item) => item.runId === plan.runId);
    expect(artifact).toMatchObject({ runId: plan.runId, status: "ready" });
    expect(artifact?.analysis).toBeTruthy();
    expect(artifact?.plan).toBeTruthy();
    expect(artifact?.reportOutline).toBeTruthy();
  }
});

test("Planner 在关键信息不足时返回补充问题并保留可追踪终态", async ({ request }) => {
  const response = await request.post("/api/plans", { data: { requirement: "做个网页" } });
  expect(response.status()).toBe(202);
  const result = await response.json() as { runId: string; status: string; clarification: { questions: Array<{ id: string }> } };
  expect(result.status).toBe("needs_clarification");
  expect(result.clarification.questions.map((question) => question.id)).toEqual(expect.arrayContaining(["business-goal", "target-users"]));
  const list = await request.get("/api/plans");
  const artifact = (await list.json() as { plans: Array<{ runId: string; status: string; clarification: unknown }> }).plans.find((item) => item.runId === result.runId);
  expect(artifact).toMatchObject({ runId: result.runId, status: "needs_clarification" });
  expect(artifact?.clarification).toBeTruthy();
});

test("Planner 模型连续输出非法 JSON 后有限重试、失败并持久化失败码", async ({ request }) => {
  const invalidServer = await startInvalidPlannerServer();
  try {
    const beforeStats = await request.get("/api/dashboard/stats");
    const beforeTokens = (await beforeStats.json() as { tokenStats: { inputTokens: number; outputTokens: number } }).tokenStats;
    const agent = await createAgent(request, "ollama", `invalid-planner-${unique()}`, invalidServer.url);
    const response = await request.post("/api/plans", {
      data: { requirement: "为访客建设企业官网，需要展示产品、案例和联系方式。", plannerAgentId: agent.id },
    });
    expect(response.status()).toBe(422);
    const failure = await response.json() as { runId: string; error: { code: string } };
    expect(failure.error.code).toBe("STRUCTURED_OUTPUT_INVALID");
    expect(invalidServer.requestCount()).toBe(2);
    const list = await request.get("/api/plans");
    const artifact = (await list.json() as { plans: Array<{ runId: string; status: string; failureCode: string }> }).plans.find((item) => item.runId === failure.runId);
    expect(artifact).toMatchObject({ status: "failed", failureCode: "STRUCTURED_OUTPUT_INVALID" });
    const afterStats = await request.get("/api/dashboard/stats");
    const afterTokens = (await afterStats.json() as { tokenStats: { inputTokens: number; outputTokens: number } }).tokenStats;
    expect(afterTokens.inputTokens - beforeTokens.inputTokens).toBeGreaterThanOrEqual(16);
    expect(afterTokens.outputTokens - beforeTokens.outputTokens).toBeGreaterThanOrEqual(8);
  } finally {
    await invalidServer.close();
  }
});

test("交叉审查保存独立双候选、证据 Finding，并对人工裁决提供幂等审计", async ({ request }) => {
  const marker = `review-${unique()}`;
  const planResponse = await request.post("/api/plans", {
    data: { requirement: `为运营团队建设 ${marker} 内容管理后台，需要角色权限、审核流程、操作审计和分阶段交付。` },
  });
  expect(planResponse.status()).toBe(201);
  const plan = await planResponse.json() as { runId: string };
  const planList = await request.get("/api/plans");
  const artifact = (await planList.json() as { plans: Array<{ id: string; runId: string }> }).plans.find((item) => item.runId === plan.runId);
  expect(artifact?.id).toBeTruthy();

  const reviewResponse = await request.post("/api/reviews", { data: { planningArtifactId: artifact?.id } });
  expect(reviewResponse.status()).toBe(202);
  const payload = await reviewResponse.json() as {
    mode: string;
    review: {
      id: string; status: string; candidates: Array<{ id: string; orientation: string }>;
      review: { findings: Array<{ id: string; severity: string; evidenceRefs: string[] }> };
      evaluation: { decision: string; selectedCandidateId: string | null; unresolvedConflicts: unknown[] };
      approval: { status: string; decision: string | null };
    };
  };
  expect(payload.mode).toBe("baseline");
  expect(payload.review.status).toBe("needs_human");
  expect(payload.review.candidates.map((candidate) => candidate.orientation).sort()).toEqual(["delivery", "quality"]);
  expect(new Set(payload.review.candidates.map((candidate) => candidate.id)).size).toBe(2);
  expect(payload.review.review.findings.length).toBeGreaterThan(0);
  expect(payload.review.review.findings.every((finding) => finding.evidenceRefs.length > 0)).toBeTruthy();
  expect(payload.review.evaluation).toMatchObject({ decision: "needs_human", selectedCandidateId: null });
  expect(payload.review.evaluation.unresolvedConflicts).toHaveLength(1);
  expect(payload.review.approval).toMatchObject({ status: "pending", decision: null });

  const prematureReport = await request.post("/api/reports", { data: { reviewWorkflowId: payload.review.id, generationKey: `premature-${unique()}` } });
  expect(prematureReport.status()).toBe(409);
  expect(await prematureReport.json()).toMatchObject({ error: { code: "REPORT_APPROVAL_REQUIRED" } });

  const approvalData = { decision: "hybrid", note: "安全与数据一致性作为硬门槛，其余能力按风险分批交付。" };
  const approval = await request.post(`/api/reviews/${payload.review.id}/approval`, { data: approvalData });
  expect(approval.status()).toBe(200);
  const approved = await approval.json() as { review: { status: string; evaluation: { decision: string }; approval: { status: string; decision: string; note: string; decidedAt: string } } };
  expect(approved.review.status).toBe("approved");
  expect(approved.review.evaluation.decision).toBe("approved");
  expect(approved.review.approval).toMatchObject({ status: "approved", decision: "hybrid", note: approvalData.note });
  expect(approved.review.approval.decidedAt).toBeTruthy();

  const identicalRetry = await request.post(`/api/reviews/${payload.review.id}/approval`, { data: approvalData });
  expect(identicalRetry.status()).toBe(200);
  const conflictingRewrite = await request.post(`/api/reviews/${payload.review.id}/approval`, { data: { decision: "approve_delivery" } });
  expect(conflictingRewrite.status()).toBe(409);

  const firstGenerationKey = `report-v1-${unique()}`;
  const firstReportResponse = await request.post("/api/reports", { data: { reviewWorkflowId: payload.review.id, generationKey: firstGenerationKey } });
  expect(firstReportResponse.status()).toBe(201);
  const firstReport = await firstReportResponse.json() as { report: { id: string; version: number; parentReportId: string | null; status: string; content: { sections: Array<{ id: string; bodyMarkdown: string }>; sourceManifest: unknown[] } } };
  expect(firstReport.report).toMatchObject({ version: 1, parentReportId: null, status: "completed" });
  expect(firstReport.report.content.sections.length).toBeGreaterThanOrEqual(3);
  expect(firstReport.report.content.sections.every((section) => section.bodyMarkdown.includes("[source:"))).toBeTruthy();
  expect(firstReport.report.content.sourceManifest.length).toBeGreaterThan(0);

  const replayResponse = await request.post("/api/reports", { data: { reviewWorkflowId: payload.review.id, generationKey: firstGenerationKey } });
  expect(replayResponse.status()).toBe(200);
  const replay = await replayResponse.json() as { replayed: boolean; mode: string; report: { id: string; version: number } };
  expect(replay).toMatchObject({ replayed: true, mode: "replay", report: { id: firstReport.report.id, version: 1 } });

  const secondReportResponse = await request.post("/api/reports", { data: { reviewWorkflowId: payload.review.id, generationKey: `report-v2-${unique()}` } });
  expect(secondReportResponse.status()).toBe(201);
  const secondReport = await secondReportResponse.json() as { report: { id: string; version: number; parentReportId: string | null } };
  expect(secondReport.report).toMatchObject({ version: 2, parentReportId: firstReport.report.id });
  const exportResponse = await request.get(`/api/reports/${secondReport.report.id}/export`);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/markdown");
  expect(exportResponse.headers()["content-disposition"]).toContain("attachment");
  const exported = await exportResponse.text();
  expect(exported).toContain("Artifact版本：v2");
  expect(exported).toContain("## 来源清单");
  expect(exported).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}\b/);

  const storedResponse = await request.get("/api/reviews");
  const stored = await storedResponse.json() as { reviews: Array<{ id: string; approval: { decision: string } }> };
  expect(stored.reviews.find((review) => review.id === payload.review.id)?.approval.decision).toBe("hybrid");
});

test("模型交叉审查对两个独立候选分别有限重试，并把全失败标为 inconclusive", async ({ request }) => {
  const invalidServer = await startInvalidPlannerServer();
  try {
    const agent = await createAgent(request, "ollama", `invalid-review-${unique()}`, invalidServer.url);
    const planResponse = await request.post("/api/plans", {
      data: { requirement: "为服务团队建设工单后台，需要角色权限、状态流转、审计日志和分阶段验收。" },
    });
    expect(planResponse.status()).toBe(201);
    const plan = await planResponse.json() as { runId: string };
    const planList = await request.get("/api/plans");
    const artifact = (await planList.json() as { plans: Array<{ id: string; runId: string }> }).plans.find((item) => item.runId === plan.runId);

    const response = await request.post("/api/reviews", {
      data: {
        planningArtifactId: artifact?.id,
        modelAgents: { candidateAgentIds: [agent.id, agent.id], reviewerAgentId: agent.id, evaluatorAgentId: agent.id },
      },
    });
    expect(response.status()).toBe(201);
    const result = await response.json() as { mode: string; review: { id: string; status: string; candidates: unknown[]; failures: Array<{ stage: string; code: string }> } };
    expect(result.mode).toBe("model");
    expect(result.review.status).toBe("inconclusive");
    expect(result.review.candidates).toEqual([]);
    expect(result.review.failures).toEqual(expect.arrayContaining([
      { stage: "candidate:delivery", code: "CANDIDATE_FAILED" },
      { stage: "candidate:quality", code: "CANDIDATE_FAILED" },
    ]));
    expect(invalidServer.requestCount()).toBe(4);

    const invalidReport = await request.post("/api/reports", {
      data: { reviewWorkflowId: result.review.id, generationKey: `invalid-report-${unique()}`, reporterAgentId: agent.id },
    });
    expect(invalidReport.status()).toBe(422);
    expect(await invalidReport.json()).toMatchObject({ error: { code: "STRUCTURED_OUTPUT_INVALID" } });
    expect(invalidServer.requestCount()).toBe(6);
    const reportList = await request.get("/api/reports");
    expect(await reportList.text()).not.toContain(result.review.id);
  } finally {
    await invalidServer.close();
  }
});

test("报告中心展示动态目录、决策、来源和可导出的不可变版本", async ({ request, page }) => {
  const marker = `report-ui-${unique()}`;
  const planResponse = await request.post("/api/plans", { data: { requirement: `为客户建设 ${marker} 企业官网，需要产品、案例、联系表单、可访问性和分阶段验收。` } });
  expect(planResponse.status()).toBe(201);
  const plan = await planResponse.json() as { runId: string };
  const planList = await request.get("/api/plans");
  const artifact = (await planList.json() as { plans: Array<{ id: string; runId: string }> }).plans.find((item) => item.runId === plan.runId);
  const reviewResponse = await request.post("/api/reviews", { data: { planningArtifactId: artifact?.id } });
  const review = await reviewResponse.json() as { review: { id: string } };
  const approval = await request.post(`/api/reviews/${review.review.id}/approval`, { data: { decision: "hybrid", note: "可访问性作为硬门槛，其余功能按风险分批。" } });
  expect(approval.status()).toBe(200);
  const reportResponse = await request.post("/api/reports", { data: { reviewWorkflowId: review.review.id, generationKey: `report-ui-${unique()}` } });
  expect(reportResponse.status()).toBe(201);
  const report = await reportResponse.json() as { report: { title: string } };

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "产品/UI 实施报告中心" })).toBeVisible();
  await expect(page.getByRole("heading", { name: report.report.title })).toBeVisible();
  await expect(page.getByText("最终决策", { exact: true })).toBeVisible();
  await expect(page.getByText("动态目录", { exact: true })).toBeVisible();
  await expect(page.getByText("来源清单", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "导出 Markdown" })).toHaveAttribute("href", /\/api\/reports\/.+\/export/);
  await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
});

test("产品工作流页展示节点并使用持久 Checkpoint 暂停、恢复且不重复副作用", async ({ request, page }) => {
  const marker = `workflow-${unique()}`;
  const create = await request.post("/api/workflows", {
    data: {
      requirement: `为运营团队建设 ${marker} 内容管理后台，需要角色权限、审核流程、操作审计、可访问性和分阶段交付。`,
      mode: "baseline",
    },
  });
  const created = await create.json() as {
    workflow: {
      id: string;
      status: string;
      currentNode: string;
      checkpoint: { id: string; namespace: string } | null;
      interrupt: { kind: string; reviewWorkflowId: string } | null;
      nodes: Array<{ key: string; status: string; artifactId: string | null }>;
      artifacts: { plan: { id: string } | null; review: { id: string } | null; report: { id: string } | null };
    };
  };
  expect(create.status(), JSON.stringify(created)).toBe(202);
  expect(created.workflow).toMatchObject({ status: "needs_human", currentNode: "human_approval" });
  expect(created.workflow.checkpoint?.namespace).toBe("");
  expect(created.workflow.checkpoint?.id).toBeTruthy();
  expect(created.workflow.interrupt?.kind).toBe("approval");
  expect(created.workflow.artifacts.plan?.id).toBeTruthy();
  expect(created.workflow.artifacts.review?.id).toBeTruthy();
  expect(created.workflow.artifacts.report).toBeNull();
  expect(created.workflow.nodes.find((node) => node.key === "human_approval")?.status).toBe("waiting");
  expect(JSON.stringify(created)).not.toContain("channel_values");
  expect(JSON.stringify(created)).not.toContain("versions_seen");

  const detail = await request.get(`/api/workflows/${created.workflow.id}`);
  expect(detail.status()).toBe(200);
  expect(await detail.json()).toMatchObject({ workflow: { id: created.workflow.id, status: "needs_human" } });

  const decision = { kind: "approval", decision: "hybrid", note: "权限和审计是硬门槛，其余功能按风险分批。" };
  await page.goto("/workflows");
  await expect(page.getByRole("heading", { name: "产品/UI报告工作流" })).toBeVisible();
  await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作流已安全暂停" })).toBeVisible();
  await expect(page.getByText("完整Checkpoint不会发送到浏览器", { exact: true })).toBeVisible();
  await page.getByLabel("裁决说明（可选）").fill(decision.note);
  await page.getByRole("button", { name: "从Checkpoint恢复" }).click();
  await expect(page.getByText("查看报告 →")).toBeVisible();

  const completedResponse = await request.get(`/api/workflows/${created.workflow.id}`);
  const completed = await completedResponse.json() as { workflow: { status: string; currentNode: string; artifacts: { report: { id: string; version: number } | null }; nodes: Array<{ key: string; status: string }> } };
  expect(completed.workflow.status).toBe("completed");
  expect(completed.workflow.artifacts.report).toMatchObject({ version: 1 });
  expect(completed.workflow.nodes.find((node) => node.key === "human_approval")?.status).toBe("completed");
  expect(completed.workflow.nodes.find((node) => node.key === "generate_report")?.status).toBe("completed");

  const identicalRetry = await request.post(`/api/workflows/${created.workflow.id}/resume`, { data: decision });
  expect(identicalRetry.status()).toBe(200);
  expect(await identicalRetry.json()).toMatchObject({ workflow: { artifacts: { report: { id: completed.workflow.artifacts.report?.id, version: 1 } } } });
  const conflictingRetry = await request.post(`/api/workflows/${created.workflow.id}/resume`, { data: { kind: "approval", decision: "delivery" } });
  expect(conflictingRetry.status()).toBe(409);

  const list = await request.get("/api/workflows");
  const listed = await list.json() as { workflows: Array<{ id: string; status: string }> };
  expect(listed.workflows).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.workflow.id, status: "completed" })]));
});

test("产品工作流可从补充信息 Checkpoint 进入新规划轮次并继续到报告", async ({ request }) => {
  const create = await request.post("/api/workflows", {
    data: { requirement: "我们想做一个新的网页产品，请帮助整理开发方案、实施步骤和验收方法。", mode: "baseline" },
  });
  expect(create.status()).toBe(202);
  const first = await create.json() as { workflow: { id: string; status: string; currentNode: string; checkpoint: { id: string } | null; interrupt: { kind: string; questions: string[] } | null; artifacts: { plan: { id: string } | null } } };
  expect(first.workflow).toMatchObject({ status: "needs_clarification", currentNode: "clarification", interrupt: { kind: "clarification" } });
  expect(first.workflow.interrupt?.questions.length).toBeGreaterThan(0);
  const firstPlanId = first.workflow.artifacts.plan?.id;
  const firstCheckpointId = first.workflow.checkpoint?.id;

  const clarification = { kind: "clarification", answer: "目标是为运营团队建设内容管理后台；管理员和编辑可登录，访客只读；必须有角色权限、审核流程、操作审计和分阶段验收。" };
  const resume = await request.post(`/api/workflows/${first.workflow.id}/resume`, { data: clarification });
  expect(resume.status()).toBe(202);
  const second = await resume.json() as { workflow: { status: string; currentNode: string; checkpoint: { id: string } | null; interrupt: { kind: string } | null; artifacts: { plan: { id: string } | null; review: { id: string } | null } } };
  expect(second.workflow).toMatchObject({ status: "needs_human", currentNode: "human_approval", interrupt: { kind: "approval" } });
  expect(second.workflow.artifacts.plan?.id).not.toBe(firstPlanId);
  expect(second.workflow.artifacts.review?.id).toBeTruthy();
  expect(second.workflow.checkpoint?.id).not.toBe(firstCheckpointId);

  const clarificationRetry = await request.post(`/api/workflows/${first.workflow.id}/resume`, { data: clarification });
  expect(clarificationRetry.status()).toBe(202);
  expect(await clarificationRetry.json()).toMatchObject({ workflow: { artifacts: { plan: { id: second.workflow.artifacts.plan?.id }, review: { id: second.workflow.artifacts.review?.id } } } });

  const approval = await request.post(`/api/workflows/${first.workflow.id}/resume`, { data: { kind: "approval", decision: "hybrid", note: "权限与审计优先。" } });
  expect(approval.status()).toBe(200);
  expect(await approval.json()).toMatchObject({ workflow: { status: "completed", artifacts: { report: { version: 1 } } } });
});

test("统一模型工作流校验完整角色，并可从失败 Checkpoint 幂等恢复", async ({ request }) => {
  const invalidServer = await startInvalidPlannerServer();
  try {
    const marker = `model-workflow-${unique()}`;
    const agent = await createAgent(request, "ollama", `workflow-model-${unique()}`, invalidServer.url);
    const beforeStats = await request.get("/api/dashboard/stats");
    const beforeTokens = (await beforeStats.json() as { tokenStats: { inputTokens: number; outputTokens: number } }).tokenStats;
    const incomplete = await request.post("/api/workflows", {
      data: { requirement: `为运营团队建设 ${marker} 后台，需要权限、审计、评审与动态报告。`, mode: "model", agents: { plannerAgentId: agent.id } },
    });
    expect(incomplete.status()).toBe(400);
    expect(await incomplete.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });

    const create = await request.post("/api/workflows", {
      data: {
        requirement: `为运营团队建设 ${marker} 后台，需要权限、审计、评审与动态报告。`,
        mode: "model",
        agents: {
          plannerAgentId: agent.id,
          candidateAgentIds: [agent.id, agent.id],
          reviewerAgentId: agent.id,
          evaluatorAgentId: agent.id,
          reporterAgentId: agent.id,
        },
      },
    });
    expect(create.status()).toBe(422);
    expect(await create.json()).toMatchObject({ error: { code: "STRUCTURED_OUTPUT_INVALID" } });
    expect(invalidServer.requestCount()).toBe(2);
    const afterStats = await request.get("/api/dashboard/stats");
    const afterTokens = (await afterStats.json() as { tokenStats: { inputTokens: number; outputTokens: number } }).tokenStats;
    expect(afterTokens.inputTokens - beforeTokens.inputTokens).toBeGreaterThanOrEqual(16);
    expect(afterTokens.outputTokens - beforeTokens.outputTokens).toBeGreaterThanOrEqual(8);

    const list = await request.get("/api/workflows");
    const workflow = (await list.json() as { workflows: Array<{ id: string; requirement: string; mode: string; status: string; recoveryAvailable: boolean }> }).workflows.find((item) => item.requirement.includes(marker));
    expect(workflow).toMatchObject({ mode: "model", status: "failed", recoveryAvailable: true });

    const recovery = await request.post(`/api/workflows/${workflow?.id}/recover`);
    expect(recovery.status()).toBe(200);
    expect(await recovery.json()).toMatchObject({ workflow: { status: "failed", recoveryAvailable: false, artifacts: { plan: { status: "failed" } } } });
    expect(invalidServer.requestCount()).toBe(2);
  } finally {
    await invalidServer.close();
  }
});

test("统一模型工作流贯通 Planner、双候选、评审、人工裁决和动态报告", async ({ request }) => {
  const marker = `model-success-${unique()}`;
  const requirement = `为运营团队建设 ${marker} 内容管理后台，需要角色权限、审核流程、操作审计、可访问性和分阶段交付。`;
  const modelServer = await startSuccessfulWorkflowServer(requirement);
  try {
    const agent = await createAgent(request, "ollama", `workflow-success-${unique()}`, modelServer.url);
    const create = await request.post("/api/workflows", {
      data: {
        requirement,
        mode: "model",
        agents: {
          plannerAgentId: agent.id,
          candidateAgentIds: [agent.id, agent.id],
          reviewerAgentId: agent.id,
          evaluatorAgentId: agent.id,
          reporterAgentId: agent.id,
        },
      },
    });
    expect(create.status()).toBe(202);
    const waiting = await create.json() as { workflow: { id: string; mode: string; status: string; artifacts: { plan: { status: string } | null; review: { status: string } | null; report: null } } };
    expect(waiting.workflow).toMatchObject({ mode: "model", status: "needs_human", artifacts: { plan: { status: "ready" }, review: { status: "needs_human" }, report: null } });
    expect(modelServer.requestCount()).toBe(6);

    const resume = await request.post(`/api/workflows/${waiting.workflow.id}/resume`, {
      data: { kind: "approval", decision: "hybrid", note: "权限与审计作为硬门槛，其余能力分阶段交付。" },
    });
    expect(resume.status()).toBe(200);
    const completed = await resume.json() as { workflow: { status: string; artifacts: { report: { id: string; status: string; version: number } | null } } };
    expect(completed.workflow).toMatchObject({ status: "completed", artifacts: { report: { status: "completed", version: 1 } } });
    expect(modelServer.requestCount()).toBe(7);

    const identical = await request.post(`/api/workflows/${waiting.workflow.id}/resume`, {
      data: { kind: "approval", decision: "hybrid", note: "权限与审计作为硬门槛，其余能力分阶段交付。" },
    });
    expect(identical.status()).toBe(200);
    expect(await identical.json()).toMatchObject({ workflow: { artifacts: { report: { id: completed.workflow.artifacts.report?.id, version: 1 } } } });
    expect(modelServer.requestCount()).toBe(7);
  } finally {
    await modelServer.close();
  }
});

test("受控知识 Tool 按 Planner授权执行、返回引用、支持幂等并记录审计", async ({ request }) => {
  const marker = `citation-${unique()}`;
  const upload = await uploadDocument(
    request,
    `knowledge-${unique()}.md`,
    Buffer.from(`# 可访问性指南\n\n## 表单错误\n${marker} 要求表单提供字段错误和页级错误摘要。`, "utf8"),
    { sourceType: "curated-reference", sourceUrl: "https://example.com/accessibility", sourceVersion: "2026.1", license: "CC-BY-4.0", reviewedAt: "2026-07-15T00:00:00.000Z" },
  );
  expect(upload.status()).toBe(201);
  const planResponse = await request.post("/api/plans", { data: { requirement: "为访客建设企业官网，需要联系表单、案例展示和可访问性验收。" } });
  expect(planResponse.status()).toBe(201);
  const plan = await planResponse.json() as { runId: string };

  const tools = await request.get("/api/tools");
  const toolList = await tools.json() as Array<{ id: string; risk: string; inputSchema: unknown }>;
  expect(toolList.map((tool) => tool.id)).toEqual(["knowledge-search", "ui-acceptance-check"]);
  expect(toolList.every((tool) => tool.risk === "read-only" && tool.inputSchema)).toBeTruthy();

  const toolCallId = `tool-${unique()}`;
  const execute = await request.post("/api/tools/execute", { data: { runId: plan.runId, toolCallId, toolId: "knowledge-search", input: { query: marker, limit: 3 } } });
  expect(execute.status()).toBe(200);
  const result = await execute.json() as { replayed: boolean; output: { results: Array<{ content: string; citation: { headingPath: string; sourceVersion: string; license: string; startLine: number } }> } };
  expect(result.replayed).toBeFalsy();
  expect(result.output.results[0]?.content).toContain(marker);
  expect(result.output.results[0]?.citation).toMatchObject({ headingPath: "可访问性指南 > 表单错误", sourceVersion: "2026.1", license: "CC-BY-4.0", startLine: 2 });

  const replay = await request.post("/api/tools/execute", { data: { runId: plan.runId, toolCallId, toolId: "knowledge-search", input: { query: marker, limit: 3 } } });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ replayed: true });

  const unauthorizedId = `tool-${unique()}`;
  const unauthorized = await request.post("/api/tools/execute", { data: { runId: plan.runId, toolCallId: unauthorizedId, toolId: "ui-acceptance-check", input: { pageType: "官网", hasVisibleLabels: true, hasKeyboardFocus: true, coveredStates: ["loading", "empty", "error"] } } });
  expect(unauthorized.status()).toBe(403);
  expect(await unauthorized.json()).toMatchObject({ error: { code: "TOOL_NOT_AUTHORIZED" } });

  const audit = await request.get(`/api/tools/execute?runId=${plan.runId}`);
  const invocations = (await audit.json() as { invocations: Array<{ id: string; status: string; errorCode: string | null }> }).invocations;
  expect(invocations).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: toolCallId, status: "completed", errorCode: null }),
    expect.objectContaining({ id: unauthorizedId, status: "failed", errorCode: "TOOL_NOT_AUTHORIZED" }),
  ]));
});
