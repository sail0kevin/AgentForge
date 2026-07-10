const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const baseAgent = {
  avatar: "SA",
  color: "#5B5BD6",
  provider: "openai",
  model: "gpt-4o-mini",
  systemPrompt: "You are a local smoke-test assistant. Reply briefly.",
  temperature: 0.7,
  maxTokens: 1200,
  capabilityIds: [],
  apiKey: "",
  apiUrl: "https://api.openai.com/v1",
};

async function main() {
  await assertAppOnline();

  await runScenario("single simulated agent", {
    input: "hello single agent smoke test",
    knowledgeSnippets: [],
    agents: [agent("smoke-one", "Smoke One")],
  }, (events) => {
    assertRequiredEvents(events);
    assertCompletedAgentIds(events, ["smoke-one"]);
    assertAssistantContentIncludes(events, "currently running in simulation mode");
  });

  await runScenario("two enabled agents reply in order", {
    input: "hello two agent smoke test",
    knowledgeSnippets: [],
    agents: [agent("smoke-one", "Smoke One"), agent("smoke-two", "Smoke Two")],
  }, (events) => {
    assertRequiredEvents(events);
    assertStartedAgentIds(events, ["smoke-one", "smoke-two"]);
    assertCompletedAgentIds(events, ["smoke-one", "smoke-two"]);
  });

  await runScenario("disabled agent is skipped", {
    input: "hello disabled agent smoke test",
    knowledgeSnippets: [],
    agents: [agent("smoke-enabled", "Smoke Enabled"), { ...agent("smoke-disabled", "Smoke Disabled"), enabled: false }],
  }, (events) => {
    assertRequiredEvents(events);
    assertStartedAgentIds(events, ["smoke-enabled"]);
    assertCompletedAgentIds(events, ["smoke-enabled"]);
    assertNoAgentEvent(events, "smoke-disabled");
  });

  await runScenario("custom openai-compatible agent is accepted", {
    input: "hello custom compatible smoke test",
    knowledgeSnippets: [],
    agents: [
      {
        ...agent("smoke-custom", "Smoke Custom"),
        provider: "custom",
        model: "custom-chat-model",
        apiUrl: "https://models.example.com/v1",
      },
    ],
  }, (events) => {
    assertRequiredEvents(events);
    assertStartedAgentIds(events, ["smoke-custom"]);
    assertCompletedAgentIds(events, ["smoke-custom"]);
    assertAssistantContentIncludes(events, "currently running in simulation mode");
  });

  await runScenario("failing agent returns assistant error and completes run", {
    input: "hello failing agent smoke test",
    knowledgeSnippets: [],
    agents: [
      {
        ...agent("smoke-bad-ollama", "Smoke Bad Ollama"),
        provider: "ollama",
        model: "missing-smoke-model",
        apiUrl: "http://127.0.0.1:9",
      },
    ],
  }, (events) => {
    assertRequiredEvents(events);
    assertStartedAgentIds(events, ["smoke-bad-ollama"]);
    assertFailedAgentIds(events, ["smoke-bad-ollama"]);
    assertAssistantContentIncludesOneOf(events, ["模型调用失败", "model call failed", "Ollama request failed", "fetch failed"]);
  });

  console.log("Manual run smoke test passed.");
  console.log(`Checked 5 scenarios against ${baseUrl}.`);
}

function agent(id, name) {
  return {
    ...baseAgent,
    id,
    name,
    enabled: true,
  };
}

async function assertAppOnline() {
  const health = await fetch(baseUrl).catch((error) => {
    throw new Error(`Cannot reach ${baseUrl}. Start the app with npm run dev or npm run start. ${error.message}`);
  });

  if (!health.ok) {
    throw new Error(`App responded with HTTP ${health.status} at ${baseUrl}.`);
  }
}

async function runScenario(name, payload, assertEvents) {
  const response = await fetch(`${baseUrl}/api/workspaces/manual/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`[${name}] Manual run failed with HTTP ${response.status}. ${detail}`.trim());
  }

  const body = await response.text();
  const events = parseSseEvents(body);
  assertEvents(events);
  console.log(`Passed: ${name}`);
}

function parseSseEvents(body) {
  return body
    .split("\n\n")
    .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace("data: ", "")));
}

function assertRequiredEvents(events) {
  const eventTypes = events.map((event) => event.type);
  const hasCompletion = eventTypes.includes("agent_completed") || eventTypes.includes("agent_failed");
  const requiredEvents = ["user_message_created", "agent_started", "run_completed"];
  const missing = requiredEvents.filter((eventName) => !eventTypes.includes(eventName));

  if (!hasCompletion) {
    missing.push("agent_completed or agent_failed");
  }

  if (missing.length > 0) {
    throw new Error(`Manual run SSE stream is missing events: ${missing.join(", ")}`);
  }
}

function assertStartedAgentIds(events, expectedIds) {
  const actualIds = events.filter((event) => event.type === "agent_started").map((event) => event.agent.id);
  assertSameArray("started agents", actualIds, expectedIds);
}

function assertCompletedAgentIds(events, expectedIds) {
  const actualIds = events.filter((event) => event.type === "agent_completed").map((event) => event.agent.id);
  assertSameArray("completed agents", actualIds, expectedIds);
}

function assertFailedAgentIds(events, expectedIds) {
  const actualIds = events.filter((event) => event.type === "agent_failed").map((event) => event.agent.id);
  assertSameArray("failed agents", actualIds, expectedIds);
}

function assertSameArray(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Unexpected ${label}. Expected [${expected.join(", ")}], got [${actual.join(", " )}].`);
  }
}

function assertNoAgentEvent(events, agentId) {
  const found = events.some((event) => event.agent?.id === agentId || event.message?.agentId === agentId);
  if (found) {
    throw new Error(`Expected agent ${agentId} to be skipped, but it appeared in the event stream.`);
  }
}

function assertAssistantContentIncludes(events, text) {
  const assistantText = events
    .filter((event) => event.type === "agent_completed")
    .map((event) => event.message.content)
    .join("\n");

  if (!assistantText.includes(text)) {
    throw new Error(`Expected assistant content to include ${JSON.stringify(text)}, but it did not.`);
  }
}

function assertAssistantContentIncludesOneOf(events, candidates) {
  const assistantText = events
    .filter((event) => event.type === "agent_completed" || event.type === "agent_failed")
    .map((event) => event.message.content)
    .join("\n");

  if (!candidates.some((text) => assistantText.includes(text))) {
    throw new Error(`Expected assistant content to include one of ${candidates.map((item) => JSON.stringify(item)).join(", ")}, but it did not.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
