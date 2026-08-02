import type { ExecutionPlan, RequirementAnalysis } from "@/lib/planner/contracts";
import type { IncrementalApprovalPatch } from "@/lib/planner/incremental-approval";
import type { ApprovalDecision, CandidateSolution, EvaluationResult, ReviewResult } from "@/lib/review/contracts";
import { DevelopmentReportSchema, type DevelopmentReport, type GitHubEvidence, type ReportClaim, type ReportSourceReference } from "./contracts";

export type ReportReviewInput = {
  id: string;
  status: "approved" | "partial" | "blocked" | "inconclusive";
  candidates: CandidateSolution[];
  review: ReviewResult;
  evaluation: EvaluationResult;
  failures: Array<{ stage: string; code: string }>;
  approval: {
    status: "not_required" | "approved" | "rejected";
    decision: ApprovalDecision | null;
    note: string | null;
    decidedAt: string | null;
    // 增量审批只允许修改现有任务，并保留原计划与修订计划指纹。
    taskPatch: IncrementalApprovalPatch | null;
    originalPlanSha256: string | null;
    amendedPlanSha256: string | null;
  };
};

export type ReportGenerationInput = {
  planningArtifactId: string;
  requirement: string;
  analysis: RequirementAnalysis;
  plan: ExecutionPlan;
  reviewWorkflow: ReportReviewInput;
  knowledgeEvidence: Array<{ source: ReportSourceReference; content: string }>;
  githubEvidence?: GitHubEvidence[];
};

function source(sourceType: ReportSourceReference["sourceType"], refId: string, label: string, locator: string | null = null): ReportSourceReference {
  return { sourceType, refId, label, locator };
}

function reportStatus(review: ReportReviewInput): DevelopmentReport["status"] {
  if (review.status === "partial") return "partial";
  if (review.status === "blocked" || review.approval.status === "rejected") return "blocked";
  if (review.status === "inconclusive") return "inconclusive";
  return "completed";
}

function decisionSummary(review: ReportReviewInput) {
  if (review.approval.decision === "approve_delivery") return "用户已确认采用交付导向候选；最终报告保留其质量债务和补偿门槛。";
  if (review.approval.decision === "approve_quality") return "用户已确认采用质量导向候选；最终报告同时说明首期时间和成本影响。";
  if (review.approval.decision === "hybrid") return `用户已确认混合方案：安全和数据一致性作为硬门槛，其余能力分阶段交付。${review.approval.note ? ` 用户备注：${review.approval.note}` : ""}`;
  if (review.approval.decision === "reject") return "用户已拒绝当前候选；报告仅保留阻塞原因和重新规划要求。";
  if (review.status === "partial") return "部分角色失败；报告只汇总已完成且可验证的内容，不把回退结果表述为完整共识。";
  return review.evaluation.reasons.join(" ");
}

function makeClaim(input: Omit<ReportClaim, "confidence"> & { confidence?: ReportClaim["confidence"] }): ReportClaim {
  return { ...input, confidence: input.confidence ?? "medium" };
}

function collectManifest(claims: ReportClaim[]) {
  const entries = new Map<string, ReportSourceReference & { usedByClaimIds: string[] }>();
  for (const claim of claims) {
    for (const reference of claim.sourceRefs) {
      const key = `${reference.sourceType}:${reference.refId}`;
      const current = entries.get(key) ?? { ...reference, usedByClaimIds: [] };
      if (!current.usedByClaimIds.includes(claim.id)) current.usedByClaimIds.push(claim.id);
      entries.set(key, current);
    }
  }
  return Array.from(entries.values()).sort((left, right) => `${left.sourceType}:${left.refId}`.localeCompare(`${right.sourceType}:${right.refId}`));
}

export function findSensitiveReportContent(value: unknown) {
  const text = JSON.stringify(value);
  const patterns = [
    /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    /\b(?:api[_ -]?key|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-/.]{12,}/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ];
  return patterns.flatMap((pattern) => text.match(pattern) ?? []);
}

export function validateDevelopmentReport(report: DevelopmentReport, input: ReportGenerationInput) {
  const issues: string[] = [];
  const planSections = [...input.plan.reportSections].sort((a, b) => a.order - b.order);
  const actualSections = [...report.sections].sort((a, b) => a.order - b.order);
  if (actualSections.map((item) => item.id).join("|") !== planSections.map((item) => item.id).join("|")) issues.push("REPORT_SECTIONS_DO_NOT_MATCH_PLAN");
  if (new Set(report.sections.map((item) => item.id)).size !== report.sections.length) issues.push("REPORT_SECTION_ID_DUPLICATE");

  const candidates = new Set(input.reviewWorkflow.candidates.map((item) => item.id));
  const findings = new Set(input.reviewWorkflow.review.findings.map((item) => item.id));
  const knowledge = new Set(input.knowledgeEvidence.map((item) => item.source.refId));
  const githubEvidence = new Set((input.githubEvidence ?? []).map((item) => item.id));
  const tasks = new Set(input.plan.tasks.map((item) => item.id));
  const humanTaskEdits = new Set(input.reviewWorkflow.approval.taskPatch?.taskEdits.map((item) => item.taskId) ?? []);
  const sections = new Set(input.plan.reportSections.map((item) => item.id));
  const valid = (reference: ReportSourceReference) => {
    if (reference.sourceType === "requirement") return reference.refId === input.planningArtifactId;
    if (reference.sourceType === "plan_task") return tasks.has(reference.refId);
    if (reference.sourceType === "report_section") return sections.has(reference.refId);
    if (reference.sourceType === "candidate") return candidates.has(reference.refId);
    if (reference.sourceType === "finding") return findings.has(reference.refId);
    if (reference.sourceType === "evaluation") return reference.refId === input.reviewWorkflow.id;
    if (reference.sourceType === "human_decision") return reference.refId === input.reviewWorkflow.id && input.reviewWorkflow.approval.decision !== null;
    if (reference.sourceType === "human_task_edit") return humanTaskEdits.has(reference.refId);
    if (reference.sourceType === "github_evidence") return githubEvidence.has(reference.refId);
    return reference.sourceType === "knowledge" && knowledge.has(reference.refId);
  };
  const claims = [...report.sections.flatMap((item) => item.claims), ...report.assumptions, ...report.risks, ...report.unresolvedItems];
  if (new Set(claims.map((item) => item.id)).size !== claims.length) issues.push("REPORT_CLAIM_ID_DUPLICATE");
  for (const claim of claims) if (claim.sourceRefs.some((reference) => !valid(reference))) issues.push(`REPORT_SOURCE_INVALID:${claim.id}`);
  const manifestKeys = new Set(report.sourceManifest.map((item) => `${item.sourceType}:${item.refId}`));
  for (const claim of claims) for (const reference of claim.sourceRefs) if (!manifestKeys.has(`${reference.sourceType}:${reference.refId}`)) issues.push(`REPORT_MANIFEST_MISSING:${claim.id}`);
  if (report.status !== reportStatus(input.reviewWorkflow)) issues.push("REPORT_STATUS_MISMATCH");
  if (findSensitiveReportContent(report).length > 0) issues.push("REPORT_SENSITIVE_CONTENT");
  return { valid: issues.length === 0, issues: Array.from(new Set(issues)) };
}

/** Deterministic Reporter used for offline operation and contract regression tests. */
export function createBaselineDevelopmentReport(input: ReportGenerationInput): DevelopmentReport {
  const orderedSections = [...input.plan.reportSections].sort((a, b) => a.order - b.order);
  const sections = orderedSections.map((section) => {
    const tasks = input.plan.tasks.filter((task) => task.reportSectionIds.includes(section.id));
    const taskIds = new Set(tasks.map((task) => task.id));
    const candidateDecisions = input.reviewWorkflow.candidates.flatMap((candidate) => candidate.decisions.map((decision) => ({ candidate, decision }))).filter(({ decision }) => decision.evidenceRefs.some((reference) => reference === `report-section:${section.id}` || (reference.startsWith("plan-task:") && taskIds.has(reference.slice("plan-task:".length)))));
    const candidateIds = new Set(candidateDecisions.map(({ candidate }) => candidate.id));
    const findings = input.reviewWorkflow.review.findings.filter((finding) => candidateIds.has(finding.candidateId) && finding.evidenceRefs.some((reference) => reference === `report-section:${section.id}` || (reference.startsWith("plan-task:") && taskIds.has(reference.slice("plan-task:".length)))));
    const claims: ReportClaim[] = [
      ...tasks.map((task, index) => makeClaim({ id: `${section.id}-task-${index + 1}`, kind: "recommendation", statement: `${task.title}：${task.description}`, confidence: "high", sourceRefs: [source("plan_task", task.id, `计划任务：${task.title}`)] })),
      ...candidateDecisions.slice(0, 8).map(({ candidate, decision }, index) => makeClaim({ id: `${section.id}-candidate-${index + 1}`, kind: "tradeoff", statement: `${decision.choice} 取舍：${decision.tradeoffs.join("；")}`, sourceRefs: [source("candidate", candidate.id, `候选方案：${candidate.title}`)] })),
      ...findings.slice(0, 8).map((finding, index) => makeClaim({ id: `${section.id}-finding-${index + 1}`, kind: "risk", statement: `${finding.failureScenario} 建议：${finding.suggestion}`, confidence: finding.evidenceRefs.length > 0 ? "high" : "low", sourceRefs: [source("finding", finding.id, `评审 Finding：${finding.category}`)] })),
    ];
    if (claims.length === 0) claims.push(makeClaim({ id: `${section.id}-purpose`, kind: "fact", statement: section.purpose, confidence: "high", sourceRefs: [source("report_section", section.id, `计划章节：${section.title}`)] }));
    const bodyMarkdown = claims.map((claim) => `- ${claim.statement} ${claim.sourceRefs.map((item) => `[source:${item.sourceType}:${item.refId}]`).join(" ")}`).join("\n");
    return { id: section.id, title: section.title, order: section.order, purpose: section.purpose, summary: `本章依据${tasks.length}项计划任务、${candidateDecisions.length}项候选决策和${findings.length}条评审意见说明${section.title}。`, bodyMarkdown, claims };
  });

  const requirementSource = source("requirement", input.planningArtifactId, "原始需求与结构化需求分析");
  const assumptions = input.analysis.assumptions.map((statement, index) => makeClaim({ id: `assumption-${index + 1}`, kind: "assumption", statement, confidence: "low", sourceRefs: [requirementSource] }));
  const risks = [
    ...input.analysis.risks.map((risk, index) => makeClaim({ id: `requirement-risk-${index + 1}`, kind: "risk", statement: `${risk.description} 缓解措施：${risk.mitigation}`, confidence: "high", sourceRefs: [requirementSource] })),
    ...input.reviewWorkflow.review.findings.filter((finding) => finding.severity === "blocking" || finding.severity === "high").map((finding, index) => makeClaim({ id: `review-risk-${index + 1}`, kind: "risk", statement: `${finding.failureScenario} 建议：${finding.suggestion}`, confidence: finding.evidenceRefs.length > 0 ? "high" : "low", sourceRefs: [source("finding", finding.id, `高优先级 Finding：${finding.category}`)] })),
  ];
  const unresolvedItems: ReportClaim[] = [
    ...input.reviewWorkflow.evaluation.unresolvedConflicts.map((conflict, index) => makeClaim({ id: `conflict-${index + 1}`, kind: "open_question", statement: `${conflict.question} 影响：${conflict.impact}`, confidence: "low", sourceRefs: [source("evaluation", input.reviewWorkflow.id, "Evaluator 未决冲突")] })),
    ...input.reviewWorkflow.failures.map((failure, index) => makeClaim({ id: `failure-${index + 1}`, kind: "open_question", statement: `${failure.stage} 未完整执行（${failure.code}），相关结论需要补充验证。`, confidence: "low", sourceRefs: [source("evaluation", input.reviewWorkflow.id, "ReviewWorkflow 失败记录")] })),
  ];
  if (input.reviewWorkflow.approval.decision) unresolvedItems.push(makeClaim({ id: "human-decision", kind: "fact", statement: decisionSummary(input.reviewWorkflow), confidence: "high", sourceRefs: [source("human_decision", input.reviewWorkflow.id, "用户人工裁决", input.reviewWorkflow.approval.decidedAt)] }));

  if (input.reviewWorkflow.approval.taskPatch) {
    const edits = input.reviewWorkflow.approval.taskPatch.taskEdits;
    unresolvedItems.push(makeClaim({
      id: "human-task-edits",
      kind: "fact",
      statement: `\u4eba\u5de5\u5ba1\u6279\u4fee\u6539\u4e86 ${edits.length} \u4e2a\u4efb\u52a1\uff1b\u4e0b\u6e38\u6267\u884c\u5e94\u4ee5\u4fee\u8ba2\u540e\u7684\u8ba1\u5212\u4e3a\u51c6\u3002`,
      confidence: "high",
      sourceRefs: edits.map((edit) => source("human_task_edit", edit.taskId, `\u4eba\u5de5\u4fee\u6539\u4efb\u52a1\uff1a${edit.taskId}`, input.reviewWorkflow.approval.amendedPlanSha256)),
    }));
  }
  const allClaims = [...sections.flatMap((section) => section.claims), ...assumptions, ...risks, ...unresolvedItems];
  const report = DevelopmentReportSchema.parse({
    schemaVersion: 1,
    title: `${input.plan.title}——产品/UI实施报告`,
    status: reportStatus(input.reviewWorkflow),
    executiveSummary: `本报告面向${input.analysis.targetUsers.join("、")}，目标是${input.analysis.goals.join("；")}。正文按照 Planner 为 ${input.analysis.projectType} 项目生成的${sections.length}个动态章节组织，服务于下游产品/UI实施，并保留候选取舍、风险、假设、失败和人工决定。`,
    decisionSummary: decisionSummary(input.reviewWorkflow),
    sections,
    assumptions,
    risks,
    unresolvedItems,
    sourceManifest: collectManifest(allClaims),
  });
  const validation = validateDevelopmentReport(report, input);
  if (!validation.valid) throw new Error(`REPORT_VALIDATION_FAILED: ${validation.issues.join(" | ")}`);
  return report;
}

export function renderDevelopmentReportMarkdown(report: DevelopmentReport, metadata: { version: number; createdAt: string }) {
  const claimList = (claims: ReportClaim[]) => claims.length === 0
    ? "- 无。"
    : claims.map((claim) => `- **${claim.kind} / ${claim.confidence}**：${claim.statement} ${claim.sourceRefs.map((item) => `[source:${item.sourceType}:${item.refId}]`).join(" ")}`).join("\n");
  const chapters = [...report.sections].sort((a, b) => a.order - b.order).map((section) => `## ${section.order}. ${section.title}\n\n${section.summary}\n\n${section.bodyMarkdown}`).join("\n\n");
  const sources = report.sourceManifest.map((item) => `- \`${item.sourceType}:${item.refId}\`：${item.label}${item.locator ? `（${item.locator}）` : ""}；用于 ${item.usedByClaimIds.join("、")}`).join("\n");
  return `# ${report.title}\n\n- 报告状态：${report.status}\n- Artifact版本：v${metadata.version}\n- 生成时间：${metadata.createdAt}\n- 契约版本：${report.schemaVersion}\n\n## 执行摘要\n\n${report.executiveSummary}\n\n## 决策摘要\n\n${report.decisionSummary}\n\n## 动态目录\n\n${[...report.sections].sort((a, b) => a.order - b.order).map((section) => `- ${section.order}. ${section.title}`).join("\n")}\n\n${chapters}\n\n## 假设\n\n${claimList(report.assumptions)}\n\n## 风险\n\n${claimList(report.risks)}\n\n## 未决事项与失败披露\n\n${claimList(report.unresolvedItems)}\n\n## 来源清单\n\n${sources}\n`;
}
