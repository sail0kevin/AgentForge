import { expect, test, type Page } from "@playwright/test";

const LEGACY_MESSAGES_KEY = "multi-agent-workspace.local-messages.v1";
const LEGACY_KNOWLEDGE_KEY = "multi-agent-workspace.local-knowledge.v1";

async function register(page: Page, email: string) {
  const response = await page.request.post("/api/auth/register", {
    data: { email, password: "correct-horse-123", name: email.split("@")[0] },
  });
  expect(response.status()).toBe(201);
  await page.reload();
  await expect(page.getByText(email.split("@")[0], { exact: true })).toBeVisible();
}

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: "correct-horse-123" },
  });
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.getByText(email.split("@")[0], { exact: true })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录工作台" })).toBeVisible();
}

async function openKnowledge(page: Page) {
  await page.getByRole("button", { name: "能力库" }).click();
  await expect(page.getByText("本地 RAG 知识", { exact: true })).toBeVisible();
}

async function addKnowledge(page: Page, title: string, content: string) {
  await page.locator('input[type="file"]').setInputFiles({ name: `${title}.md`, mimeType: "text/markdown", buffer: Buffer.from(`# ${title}\n${content}`, "utf8") });
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test("server knowledge, plans, tools and transient state stay isolated across session account switches", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userA = `a-${suffix}@example.com`;
  const userB = `b-${suffix}@example.com`;

  await page.goto("/");
  await page.evaluate(({ legacyMessagesKey, legacyKnowledgeKey }) => {
    localStorage.setItem(legacyMessagesKey, JSON.stringify([{ id: "legacy-message", role: "user", content: "LEGACY-MESSAGE-MUST-NOT-APPEAR", createdAt: new Date().toISOString() }]));
    localStorage.setItem(legacyKnowledgeKey, JSON.stringify([{ id: "legacy-knowledge", title: "LEGACY-KNOWLEDGE-MUST-NOT-APPEAR", content: "unowned", createdAt: new Date().toISOString() }]));
  }, { legacyMessagesKey: LEGACY_MESSAGES_KEY, legacyKnowledgeKey: LEGACY_KNOWLEDGE_KEY });

  await register(page, userA);
  await expect(page.getByText("LEGACY-MESSAGE-MUST-NOT-APPEAR", { exact: true })).toHaveCount(0);
  await openKnowledge(page);
  await expect(page.getByText("LEGACY-KNOWLEDGE-MUST-NOT-APPEAR", { exact: true })).toHaveCount(0);
  await addKnowledge(page, "A-ONLY-KNOWLEDGE", "Only account A may read this browser snippet.");
  const planMarker = `A-ONLY-PLAN-${suffix}`;
  const planResponse = await page.request.post("/api/plans", {
    data: { requirement: `为客户建设企业官网，展示 ${planMarker}、案例和联系方式。` },
  });
  expect(planResponse.status()).toBe(201);
  const userAPlan = await planResponse.json() as { runId: string };
  const userAPlanList = await page.request.get("/api/plans");
  const userAArtifact = (await userAPlanList.json() as { plans: Array<{ id: string; runId: string }> }).plans.find((plan) => plan.runId === userAPlan.runId);
  expect(userAArtifact?.id).toBeTruthy();
  const userAReviewResponse = await page.request.post("/api/reviews", { data: { planningArtifactId: userAArtifact?.id } });
  expect(userAReviewResponse.status()).toBe(202);
  const userAReview = await userAReviewResponse.json() as { review: { id: string } };
  const userAApproval = await page.request.post(`/api/reviews/${userAReview.review.id}/approval`, {
    data: { decision: "hybrid", note: "Account A selected a staged hybrid report." },
  });
  expect(userAApproval.status()).toBe(200);
  const userAReportResponse = await page.request.post("/api/reports", { data: { reviewWorkflowId: userAReview.review.id, generationKey: `session-report-${suffix}` } });
  expect(userAReportResponse.status()).toBe(201);
  const userAReport = await userAReportResponse.json() as { report: { id: string } };
  const workflowMarker = `A-ONLY-WORKFLOW-${suffix}`;
  const userAWorkflowResponse = await page.request.post("/api/workflows", {
    data: { requirement: `为运营团队建设 ${workflowMarker} 管理后台，需要权限、审核、审计与分阶段交付。`, mode: "baseline" },
  });
  expect(userAWorkflowResponse.status()).toBe(202);
  const userAWorkflow = await userAWorkflowResponse.json() as { workflow: { id: string; status: string; checkpoint: { id: string } | null } };
  expect(userAWorkflow.workflow).toMatchObject({ status: "needs_human" });
  expect(userAWorkflow.workflow.checkpoint?.id).toBeTruthy();
  expect(JSON.stringify(userAWorkflow)).not.toContain("channel_values");
  const documentMarker = `A-ONLY-DOCUMENT-${suffix}`;
  const documentResponse = await page.request.post("/api/documents", {
    multipart: { file: { name: `a-${suffix}.md`, mimeType: "text/markdown; charset=utf-8", buffer: Buffer.from(`# A知识\n${documentMarker} 只属于账号A。`, "utf8") } },
  });
  expect(documentResponse.status()).toBe(201);

  const legacyKeysAfterMigration = await page.evaluate(({ legacyMessagesKey, legacyKnowledgeKey }) => ({
    messages: localStorage.getItem(legacyMessagesKey),
    knowledge: localStorage.getItem(legacyKnowledgeKey),
  }), { legacyMessagesKey: LEGACY_MESSAGES_KEY, legacyKnowledgeKey: LEGACY_KNOWLEDGE_KEY });
  expect(legacyKeysAfterMigration).toEqual({ messages: null, knowledge: null });

  await logout(page);
  await register(page, userB);
  const userBPlans = await page.request.get("/api/plans");
  expect(await userBPlans.text()).not.toContain(planMarker);
  const userBSearch = await page.request.post("/api/documents/search", { data: { query: documentMarker } });
  expect(await userBSearch.json()).toEqual({ results: [] });
  const crossUserTool = await page.request.post("/api/tools/execute", {
    data: { runId: userAPlan.runId, toolCallId: `cross-${suffix}`, toolId: "knowledge-search", input: { query: documentMarker } },
  });
  expect(crossUserTool.status()).toBe(404);
  const crossUserApproval = await page.request.post(`/api/reviews/${userAReview.review.id}/approval`, {
    data: { decision: "hybrid", note: "Account B must not decide Account A's review." },
  });
  expect(crossUserApproval.status()).toBe(404);
  const crossUserReport = await page.request.get(`/api/reports/${userAReport.report.id}`);
  expect(crossUserReport.status()).toBe(404);
  const crossUserExport = await page.request.get(`/api/reports/${userAReport.report.id}/export`);
  expect(crossUserExport.status()).toBe(404);
  const userBReports = await page.request.get("/api/reports");
  expect(await userBReports.text()).not.toContain(userAReport.report.id);
  const userBWorkflows = await page.request.get("/api/workflows");
  expect(await userBWorkflows.text()).not.toContain(workflowMarker);
  expect((await page.request.get(`/api/workflows/${userAWorkflow.workflow.id}`)).status()).toBe(404);
  expect((await page.request.post(`/api/workflows/${userAWorkflow.workflow.id}/resume`, { data: { kind: "approval", decision: "hybrid" } })).status()).toBe(404);
  expect((await page.request.post(`/api/workflows/${userAWorkflow.workflow.id}/recover`)).status()).toBe(404);
  await openKnowledge(page);
  await expect(page.getByText("A-ONLY-KNOWLEDGE", { exact: true })).toHaveCount(0);
  await addKnowledge(page, "B-ONLY-KNOWLEDGE", "Only account B may read this browser snippet.");

  await logout(page);
  await login(page, userA);
  const userAPlans = await page.request.get("/api/plans");
  expect(await userAPlans.text()).toContain(planMarker);
  const userATool = await page.request.post("/api/tools/execute", {
    data: { runId: userAPlan.runId, toolCallId: `owned-${suffix}`, toolId: "knowledge-search", input: { query: documentMarker } },
  });
  expect(userATool.status()).toBe(200);
  expect(await userATool.text()).toContain(documentMarker);
  const userAReviews = await page.request.get("/api/reviews");
  expect(await userAReviews.text()).toContain(userAReview.review.id);
  const userAReports = await page.request.get("/api/reports");
  expect(await userAReports.text()).toContain(userAReport.report.id);
  const userAWorkflows = await page.request.get("/api/workflows");
  expect(await userAWorkflows.text()).toContain(workflowMarker);
  await openKnowledge(page);
  await expect(page.getByText("A-ONLY-KNOWLEDGE", { exact: true })).toBeVisible();
  await expect(page.getByText("B-ONLY-KNOWLEDGE", { exact: true })).toHaveCount(0);
});
