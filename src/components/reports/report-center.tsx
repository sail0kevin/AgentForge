"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clipboard, ClipboardCheck, Download, FileJson, FileText, FileUp, GitBranch, Loader2, RefreshCw, Scale, ShieldAlert, Sparkles } from "lucide-react";

type Evidence = { id: string; repositoryName: string; repositoryUrl: string; commitOrTag: string; path: string; license: string; evidenceStatus?: string; reusePolicy: string; insight: string; repositoryVerification: "not_checked" | "verified"; pathVerification: "not_checked" | "verified"; licenseVerification: "not_checked" | "verified" };
type ProductUISpec = {
  solutionId: string;
  solutionType: string;
  productName: string;
  productPositioning: string;
  targetUsers: string[];
  primaryScenarios: string[];
  pages: Array<{ id: string; name: string; route: string; purpose: string; primaryAction: string; sections: string[]; requiredStates: string[]; components: string[]; blueprint?: { layout: string; aboveFold: string[]; contentRules: string[]; interactionRules: string[] }; implementationInstructions?: string[]; acceptanceCriteria: string[] }>;
  acceptanceMatrix?: Array<{ id: string; targetType: string; targetId: string; criterion: string; verificationMethod: string; expectedEvidence: string }>;
  userFlows: Array<{ id: string; name: string; goal: string; steps: string[]; failureRecovery: string }>;
  designDirection: { name: string; positioning: string; visualPrinciples: string[]; layoutStrategy: string; componentStrategy: string; avoid: string[]; tokens: Record<string, string> };
  components: Array<{ name: string; responsibility: string; variants: string[]; states: string[]; accessibility: string[] }>;
  responsiveRules: string[];
  interactionStates: string[];
  implementationConstraints: string[];
  visualAcceptanceCriteria: string[];
  deliveryBoundary: { included: string[]; excluded: string[]; handoff: string };
  aiExecutionContract?: { objective: string; outputRequirements: string[]; implementationOrder: string[]; contentRequirements: string[]; forbiddenClaims: string[]; verificationChecklist: string[] };
  traceability: Array<{ id: string; area: string; statement: string; status: string; sourceRefs: Array<{ sourceType: string; refId: string; label: string; locator: string | null }> }>;
  evidence: Evidence[];
  evidenceStatus: string;
  evidenceAuditStatus: "not_checked" | "partially_verified" | "fully_verified";
};
type ProductUIReport = { id: string; title: string; executiveSummary: string; productUISpec?: ProductUISpec };
type ImplementationRunEvidence = {
  schemaVersion: 1;
  runId: string;
  caseId: string;
  variant: "baseline_direct_prompt" | "agentforge_manifest";
  reportGroupId: string;
  solutionId: string;
  reportSha256: string | null;
  manifestSha256: string | null;
  promptSha256: string;
  downstreamModel: { provider: string; model: string; promptVersion: string; parameters: Record<string, unknown>; adapterVersion: string };
  executionEvidence: {
    provider: string;
    model: string;
    promptVersion: string;
    parametersSha256: string;
    adapterVersion: string;
    seedSha256: string;
    generatorSummaryPath: string;
  };
  sourceRevision: string | null;
  startedAt: string;
  completedAt: string;
  exitStatus: "completed" | "failed" | "timeout" | "cancelled";
  generatorOutputPaths: string[];
  previewOutputPaths: string[];
  orchestratorOutputPaths: string[];
  playwrightOutputPaths: string[];
};
type RuntimeEvidence = {
  launchCommand: string;
  previewUrl: string;
  screenshotPaths: string[];
  verificationNotes: string[];
  acceptanceResults: Array<{ acceptanceId: string; status: "passed" | "failed" | "not_verified"; note: string; evidencePaths: string[] }>;
  implementationRun?: ImplementationRunEvidence;
};
type AcceptanceResultDraft = {
  acceptanceId: string;
  status: "passed" | "failed" | "not_verified";
  note: string;
  evidencePathsText: string;
};
type Feedback = { solutionId: string; outcome: "pass" | "needs_revision"; note: string; runtimeEvidence: RuntimeEvidence | null; checkedAt: string };
type ReportGroup = { id: string; groupId: string; reviewWorkflowId: string; requirement: string; status: string; feedback: Feedback[]; reports: ProductUIReport[]; comparison: Array<{ solutionId: string; strengths: string[]; tradeoffs: string[] }>; createdAt: string };
type SourceRef = { sourceType: string; refId: string; label: string; locator: string | null; usedByClaimIds: string[] };
type Claim = { id: string; kind: string; statement: string; confidence: string; sourceRefs: Array<Omit<SourceRef, "usedByClaimIds">> };
type Chapter = { id: string; title: string; order: number; purpose: string; summary: string; claims: Claim[] };
type LegacyReport = {
  id: string;
  reviewWorkflowId: string;
  parentReportId: string | null;
  version: number;
  status: string;
  title: string;
  executiveSummary: string;
  createdAt: string;
  content: { decisionSummary: string; sections: Chapter[]; assumptions: Claim[]; risks: Claim[]; unresolvedItems: Claim[]; sourceManifest: SourceRef[] };
};
type ReviewRecord = { id: string; status: string; approval: { status: string; decision: string | null; note: string | null } };

const solutionLabels: Record<string, string> = { experience_first: "体验优先", visual_first: "视觉优先", engineering_first: "工程优先" };
const traceabilityStatusLabels: Record<string, string> = { implemented: "已实现", target_design: "目标设计", verified: "已验证来源", unverified: "未验证" };
const evidenceAuditLabels: Record<string, string> = { not_checked: "未完成审计", partially_verified: "部分已核验", fully_verified: "已完成核验" };
const groupStatusLabels: Record<string, string> = { generated: "已生成", in_review: "验收中", accepted: "已验收", needs_revision: "需要修改" };
const groupStatusStyles: Record<string, string> = { generated: "border-sky-200 bg-sky-50 text-sky-700", in_review: "border-amber-200 bg-amber-50 text-amber-800", accepted: "border-emerald-200 bg-emerald-50 text-emerald-700", needs_revision: "border-red-200 bg-red-50 text-red-700" };

// 将多行文本转换成结构化证据数组，便于后端校验和后续复核。
function evidenceLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseImportedRuntimeEvidence(raw: unknown): RuntimeEvidence {
  if (!isRecord(raw)) throw new Error("运行证据 JSON 必须是对象。");
  const requiredString = (value: unknown, field: string) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`运行证据中的 ${field} 不能为空。`);
    return value.trim();
  };
  const sha256 = (value: unknown, field: string) => {
    const normalized = requiredString(value, field);
    if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`运行证据中的 ${field} 必须是 SHA-256 哈希。`);
    return normalized;
  };
  const strings = (value: unknown, field: string, minimum = 0) => {
    if (!Array.isArray(value) || value.length < minimum || value.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`运行证据中的 ${field} 格式无效。`);
    }
    return value.map((item) => item.trim());
  };
  if (typeof raw.launchCommand !== "string" || !raw.launchCommand.trim() || typeof raw.previewUrl !== "string" || !raw.previewUrl.trim()) {
    throw new Error("运行证据缺少启动命令或访问地址。");
  }
  if (!Array.isArray(raw.acceptanceResults)) throw new Error("运行证据中的 acceptanceResults 格式无效。");
  const parsedAcceptanceResults = raw.acceptanceResults.map((item) => {
    if (!isRecord(item)
      || typeof item.acceptanceId !== "string"
      || !["passed", "failed", "not_verified"].includes(String(item.status))
      || typeof item.note !== "string"
      || !item.note.trim()) {
      throw new Error("运行证据中存在格式无效的验收结果。");
    }
    return {
      acceptanceId: item.acceptanceId.trim(),
      status: item.status as AcceptanceResultDraft["status"],
      note: item.note.trim(),
      evidencePaths: strings(item.evidencePaths, `${item.acceptanceId} evidencePaths`),
    };
  });
  const acceptanceIds = new Set(parsedAcceptanceResults.map((item) => item.acceptanceId));
  if (acceptanceIds.size !== parsedAcceptanceResults.length) throw new Error("运行证据中不能重复同一个验收 ID。");

  const run = raw.implementationRun;
  if (!isRecord(run) || run.schemaVersion !== 1 || !isRecord(run.downstreamModel) || !isRecord(run.downstreamModel.parameters)
    || !isRecord(run.executionEvidence) || (run.variant !== "baseline_direct_prompt" && run.variant !== "agentforge_manifest")
    || (run.reportSha256 !== null && typeof run.reportSha256 !== "string")
    || (run.manifestSha256 !== null && typeof run.manifestSha256 !== "string")
    || (run.sourceRevision !== null && typeof run.sourceRevision !== "string")
    || !["completed", "failed", "timeout", "cancelled"].includes(String(run.exitStatus))) {
    throw new Error("运行证据缺少有效 implementationRun 元数据。");
  }
  const reportSha256 = run.reportSha256 === null ? null : sha256(run.reportSha256, "implementationRun.reportSha256");
  const manifestSha256 = run.manifestSha256 === null ? null : sha256(run.manifestSha256, "implementationRun.manifestSha256");
  const executionEvidence = {
    provider: requiredString(run.executionEvidence.provider, "implementationRun.executionEvidence.provider"),
    model: requiredString(run.executionEvidence.model, "implementationRun.executionEvidence.model"),
    promptVersion: requiredString(run.executionEvidence.promptVersion, "implementationRun.executionEvidence.promptVersion"),
    parametersSha256: sha256(run.executionEvidence.parametersSha256, "implementationRun.executionEvidence.parametersSha256"),
    adapterVersion: requiredString(run.executionEvidence.adapterVersion, "implementationRun.executionEvidence.adapterVersion"),
    seedSha256: sha256(run.executionEvidence.seedSha256, "implementationRun.executionEvidence.seedSha256"),
    generatorSummaryPath: requiredString(run.executionEvidence.generatorSummaryPath, "implementationRun.executionEvidence.generatorSummaryPath"),
  };

  return {
    launchCommand: raw.launchCommand.trim(),
    previewUrl: raw.previewUrl.trim(),
    screenshotPaths: strings(raw.screenshotPaths, "screenshotPaths", 1),
    verificationNotes: strings(raw.verificationNotes, "verificationNotes", 1),
    acceptanceResults: parsedAcceptanceResults,
    implementationRun: {
      schemaVersion: 1,
      runId: requiredString(run.runId, "implementationRun.runId"),
      caseId: requiredString(run.caseId, "implementationRun.caseId"),
      variant: run.variant,
      reportGroupId: requiredString(run.reportGroupId, "implementationRun.reportGroupId"),
      solutionId: requiredString(run.solutionId, "implementationRun.solutionId"),
      reportSha256,
      manifestSha256,
      promptSha256: sha256(run.promptSha256, "implementationRun.promptSha256"),
      downstreamModel: {
        provider: requiredString(run.downstreamModel.provider, "implementationRun.downstreamModel.provider"),
        model: requiredString(run.downstreamModel.model, "implementationRun.downstreamModel.model"),
        promptVersion: requiredString(run.downstreamModel.promptVersion, "implementationRun.downstreamModel.promptVersion"),
        parameters: run.downstreamModel.parameters,
        adapterVersion: requiredString(run.downstreamModel.adapterVersion, "implementationRun.downstreamModel.adapterVersion"),
      },
      executionEvidence,
      sourceRevision: run.sourceRevision === null ? null : requiredString(run.sourceRevision, "implementationRun.sourceRevision"),
      startedAt: requiredString(run.startedAt, "implementationRun.startedAt"),
      completedAt: requiredString(run.completedAt, "implementationRun.completedAt"),
      exitStatus: run.exitStatus as ImplementationRunEvidence["exitStatus"],
      generatorOutputPaths: strings(run.generatorOutputPaths, "implementationRun.generatorOutputPaths"),
      previewOutputPaths: strings(run.previewOutputPaths, "implementationRun.previewOutputPaths"),
      orchestratorOutputPaths: strings(run.orchestratorOutputPaths, "implementationRun.orchestratorOutputPaths"),
      playwrightOutputPaths: strings(run.playwrightOutputPaths, "implementationRun.playwrightOutputPaths"),
    },
  };
}
function List({ items, empty = "暂无" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />{item}</li>)}</ul>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-slate-200 py-6 first:border-t-0 first:pt-0"><h3 className="mb-3 text-base font-bold text-slate-900">{title}</h3>{children}</section>;
}

const legacyStatusStyle: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-red-200 bg-red-50 text-red-700",
  inconclusive: "border-slate-300 bg-slate-100 text-slate-700",
};
const legacyStatusLabel: Record<string, string> = { completed: "已完成", partial: "部分完成", blocked: "已阻塞", inconclusive: "不可裁决" };
const claimKindLabel: Record<string, string> = { fact: "事实", assumption: "假设", recommendation: "建议", risk: "风险", tradeoff: "取舍", open_question: "待确认" };

function ClaimList({ claims, empty = "无" }: { claims: Claim[]; empty?: string }) {
  if (claims.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return <div className="space-y-3">{claims.map((claim) => <article key={claim.id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">{claimKindLabel[claim.kind] ?? claim.kind}</span><span className="text-slate-500">置信度：{claim.confidence}</span></div><p className="text-sm leading-6 text-slate-800">{claim.statement}</p><div className="mt-3 flex flex-wrap gap-2">{claim.sourceRefs.map((source) => <code key={`${source.sourceType}:${source.refId}`} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{source.sourceType}:{source.refId}</code>)}</div></article>)}</div>;
}

function LegacyReportContent({ report }: { report: LegacyReport }) {
  return <>
    <div className="border-b border-slate-200 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${legacyStatusStyle[report.status] ?? legacyStatusStyle.inconclusive}`}>{legacyStatusLabel[report.status] ?? report.status}</span><span className="text-xs text-slate-500">v{report.version}{report.parentReportId ? " · 有上一版本" : " · 初始版本"}</span></div><h2 className="mt-3 text-2xl font-bold tracking-tight">{report.title}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{report.executiveSummary}</p></div><a className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700" href={`/api/reports/${report.id}/export`}><Download className="h-4 w-4" />导出 Markdown</a></div></div>
    <div className="space-y-8 p-6"><section className="rounded-lg border border-indigo-200 bg-indigo-50 p-5"><div className="flex items-center gap-2 font-bold text-indigo-900"><Scale className="h-5 w-5" />最终决策</div><p className="mt-2 text-sm leading-7 text-indigo-900">{report.content.decisionSummary}</p></section>{[...report.content.sections].sort((a, b) => a.order - b.order).map((chapter) => <section key={chapter.id} id={`legacy-chapter-${chapter.id}`} className="scroll-mt-4"><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">第 {chapter.order} 章</p><h3 className="mt-1 text-xl font-bold">{chapter.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{chapter.summary}</p><div className="mt-4"><ClaimList claims={chapter.claims} /></div></section>)}<section><div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h3 className="text-lg font-bold">风险</h3></div><ClaimList claims={report.content.risks} /></section><section><div className="mb-3 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-slate-600" /><h3 className="text-lg font-bold">假设与未决事项</h3></div><ClaimList claims={[...report.content.assumptions, ...report.content.unresolvedItems]} /></section></div>
  </>;
}

function LegacyReportSidebar({ report }: { report: LegacyReport }) {
  return <div className="sticky top-5 space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="font-bold">动态目录</h2><nav className="mt-3 space-y-1">{[...report.content.sections].sort((a, b) => a.order - b.order).map((chapter) => <a key={chapter.id} href={`#legacy-chapter-${chapter.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-700">{chapter.order}. {chapter.title}</a>)}</nav></section><section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><h2 className="font-bold">来源清单</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">报告中的来源与引用次数。</p><div className="mt-3 max-h-[430px] space-y-2 overflow-auto">{report.content.sourceManifest.map((source) => <div key={`${source.sourceType}:${source.refId}`} className="rounded-lg bg-slate-50 p-3"><code className="break-all text-[11px] font-semibold text-indigo-700">{source.sourceType}:{source.refId}</code><p className="mt-1 text-xs leading-5 text-slate-600">{source.label}</p><p className="mt-1 text-[10px] text-slate-400">引用 {source.usedByClaimIds.length} 次</p></div>)}</div></section></div>;
}

export function ReportCenter() {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [legacyReports, setLegacyReports] = useState<LegacyReport[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [selectedLegacyId, setSelectedLegacyId] = useState<string | null>(null);
  const [aiExecutionReport, setAiExecutionReport] = useState("");
  const [loadedReportKey, setLoadedReportKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackOutcome, setFeedbackOutcome] = useState<Feedback["outcome"]>("pass");
  const [launchCommand, setLaunchCommand] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [screenshotPathsText, setScreenshotPathsText] = useState("");
  const [verificationNotesText, setVerificationNotesText] = useState("");
  // 默认“未验证”，避免界面在没有真实检查时暗示任何验收项已经通过。
  const [acceptanceResultDrafts, setAcceptanceResultDrafts] = useState<AcceptanceResultDraft[]>([]);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [experimentStudyId, setExperimentStudyId] = useState("");
  const [experimentCaseId, setExperimentCaseId] = useState("");
  const [experimentProvider, setExperimentProvider] = useState("openai");
  const [experimentModel, setExperimentModel] = useState("");
  const [experimentPromptVersion, setExperimentPromptVersion] = useState("ui-implementation-v1");
  // 导出实验包前记录真实使用的生成适配器版本，便于后续复现同一执行条件。
  const [experimentAdapterVersion, setExperimentAdapterVersion] = useState("agentforge-implementation-adapter-v1");
  const [experimentMinimumCaseCount, setExperimentMinimumCaseCount] = useState("6");
  const [experimentMinimumRaterCount, setExperimentMinimumRaterCount] = useState("2");
  const [exportingExperiment, setExportingExperiment] = useState(false);
  const experimentInputKeyRef = useRef<string | null>(null);
  const runtimeEvidenceInputRef = useRef<HTMLInputElement>(null);
  const [importedImplementationRun, setImportedImplementationRun] = useState<ImplementationRunEvidence | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupsResponse, legacyReportsResponse, reviewsResponse] = await Promise.all([fetch("/api/reports/product-ui", { cache: "no-store" }), fetch("/api/reports", { cache: "no-store" }), fetch("/api/reviews", { cache: "no-store" })]);
      if (groupsResponse.status === 401 || reviewsResponse.status === 401) throw new Error("请先完成登录。 ");
      if (!groupsResponse.ok || !reviewsResponse.ok) throw new Error("报告中心数据加载失败。 ");
      if (legacyReportsResponse.status === 401 || !legacyReportsResponse.ok) throw new Error("legacy report data load failed");
      const groupData = await groupsResponse.json() as { groups: ReportGroup[] };
      const legacyReportData = await legacyReportsResponse.json() as { reports: LegacyReport[] };
      const reviewData = await reviewsResponse.json() as { reviews: ReviewRecord[] };
      setGroups(groupData.groups);
      setLegacyReports(legacyReportData.reports);
      setReviews(reviewData.reviews);
      // 工作流页会携带当前报告组 ID，优先打开用户刚完成的那一组，避免多需求并存时误选最近报告。
      const requestedGroupId = new URLSearchParams(window.location.search).get("groupId");
      setSelectedGroupId((current) => requestedGroupId && groupData.groups.some((group) => group.id === requestedGroupId)
        ? requestedGroupId
        : current && groupData.groups.some((group) => group.id === current)
          ? current
          : groupData.groups[0]?.id ?? null);
      setSelectedLegacyId((current) => current && legacyReportData.reports.some((report) => report.id === current) ? current : legacyReportData.reports[0]?.id ?? null);
      setSelectedReviewId((current) => current || reviewData.reviews.find((review) => review.approval.status !== "pending" && review.status !== "needs_human")?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "报告中心数据加载失败。 ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) ?? null, [groups, selectedGroupId]);
  const selectedLegacyReport = useMemo(() => legacyReports.find((report) => report.id === selectedLegacyId) ?? null, [legacyReports, selectedLegacyId]);
  const effectiveSolutionId = selectedGroup?.reports.some((report) => report.productUISpec?.solutionId === selectedSolutionId) ? selectedSolutionId : selectedGroup?.reports[0]?.productUISpec?.solutionId ?? null;
  const selectedReport = useMemo(() => selectedGroup?.reports.find((report) => report.productUISpec?.solutionId === effectiveSolutionId) ?? selectedGroup?.reports[0] ?? null, [selectedGroup, effectiveSolutionId]);
  const selectedSpec = selectedReport?.productUISpec ?? null;
  const selectedReportKey = selectedGroup && selectedSpec ? `${selectedGroup.id}:${selectedSpec.solutionId}` : null;
  const visibleAiExecutionReport = loadedReportKey === selectedReportKey ? aiExecutionReport : "";
  const reportableReviews = reviews.filter((review) => review.approval.status !== "pending" && review.status !== "needs_human");
  const acceptanceMatrix = selectedSpec?.acceptanceMatrix ?? [];
  const acceptancePassReady = acceptanceMatrix.every((item) => {
    const draft = acceptanceResultDrafts.find((result) => result.acceptanceId === item.id);
    return draft?.status === "passed" && draft.note.trim().length >= 3 && evidenceLines(draft.evidencePathsText).length > 0;
  });
  const acceptanceRevisionReady = acceptanceMatrix.length === 0 || acceptanceResultDrafts.some((draft) => (
    (draft.status === "failed" || draft.status === "not_verified") && draft.note.trim().length >= 3
  ));
  const feedbackReady = Boolean(
    feedbackNote.trim()
    && launchCommand.trim()
    && previewUrl.trim()
    && evidenceLines(screenshotPathsText).length > 0
    && evidenceLines(verificationNotesText).length > 0
    && (feedbackOutcome === "pass" ? acceptancePassReady : acceptanceRevisionReady)
  );

  const selectedExperimentGroupId = selectedGroup?.id ?? null;
  const selectedExperimentGroupKey = selectedGroup?.groupId ?? null;
  const selectedExperimentSolutionId = selectedSpec?.solutionId ?? null;

  useEffect(() => {
    // 切换方案时重置实验元数据，确保下载包与当前报告方案一一对应。
    const timer = window.setTimeout(() => {
      if (!selectedExperimentGroupId || !selectedExperimentGroupKey || !selectedExperimentSolutionId) return;
      const inputKey = `${selectedExperimentGroupId}:${selectedExperimentSolutionId}`;
      if (experimentInputKeyRef.current === inputKey) return;
      experimentInputKeyRef.current = inputKey;
      setExperimentStudyId(`product-ui-${selectedExperimentGroupKey}`);
      setExperimentCaseId(`case-${selectedExperimentGroupKey}-${selectedExperimentSolutionId}`);
      setExperimentProvider("openai");
      setExperimentModel("");
      setExperimentPromptVersion("ui-implementation-v1");
      setExperimentAdapterVersion("agentforge-implementation-adapter-v1");
      setExperimentMinimumCaseCount("6");
      setExperimentMinimumRaterCount("2");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedExperimentGroupId, selectedExperimentGroupKey, selectedExperimentSolutionId]);

  useEffect(() => {
    // 切换方案或保存反馈后异步同步草稿，避免 Effect 内同步 setState 触发级联渲染。
    const timer = window.setTimeout(() => {
      if (!selectedSpec) {
        setAcceptanceResultDrafts([]);
        setImportedImplementationRun(null);
        return;
      }
      const previousRuntimeEvidence = selectedGroup?.feedback.find((item) => item.solutionId === selectedSpec.solutionId)?.runtimeEvidence ?? null;
      const previousResults = previousRuntimeEvidence?.acceptanceResults ?? [];
      setImportedImplementationRun(previousRuntimeEvidence?.implementationRun ?? null);
      const resultById = new Map(previousResults.map((item) => [item.acceptanceId, item]));
      setAcceptanceResultDrafts((selectedSpec.acceptanceMatrix ?? []).map((item) => {
        const previous = resultById.get(item.id);
        return {
          acceptanceId: item.id,
          status: previous?.status ?? "not_verified",
          note: previous?.note ?? "",
          evidencePathsText: previous?.evidencePaths.join("\n") ?? "",
        };
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedGroup?.feedback, selectedSpec]);
  useEffect(() => {
    if (!selectedGroup || !selectedSpec) return;
    const controller = new AbortController();
    const currentReportKey = `${selectedGroup.id}:${selectedSpec.solutionId}`;
    void fetch(`/api/reports/product-ui/${selectedGroup.id}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("方案详情加载失败。 ");
      const data = await response.json() as { reports?: Array<{ solutionId: string; aiExecutionReport?: string; aiExecutionMarkdown?: string; prompt?: string }>; prompts?: Array<{ solutionId: string; prompt: string }> };
      const report = data.reports?.find((item) => item.solutionId === selectedSpec.solutionId);
      // 旧字段 prompt 仅作为兼容兜底，前台主交付物始终是完整 AI 执行报告。
      const legacyPromptFallback = data.prompts?.find((item) => item.solutionId === selectedSpec.solutionId)?.prompt;
      // aiExecutionReport 是当前主交付物；旧字段仅用于兼容历史 API 和已保存报告。
      setAiExecutionReport(report?.aiExecutionReport ?? report?.aiExecutionMarkdown ?? report?.prompt ?? legacyPromptFallback ?? "");
      setLoadedReportKey(currentReportKey);
    }).catch((requestError) => {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "方案详情加载失败。 ");
    });
    return () => controller.abort();
  }, [selectedGroup, selectedSpec]);

  async function generate() {
    if (!selectedReviewId) { setError("请先选择一个已完成评审的工作流。 "); return; }
    setGenerating(true); setError(null);
    try {
      const response = await fetch("/api/reports/product-ui", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewWorkflowId: selectedReviewId, solutionTypes: ["experience_first", "visual_first", "engineering_first"] }) });
      const data = await response.json() as { group?: ReportGroup; error?: { message?: string } };
      if (!response.ok || !data.group) throw new Error(data.error?.message ?? "产品/UI报告生成失败。 ");
      setGroups((current) => [data.group!, ...current.filter((group) => group.id !== data.group!.id)]);
      setSelectedGroupId(data.group.id);
      setSelectedSolutionId(data.group.reports[0]?.productUISpec?.solutionId ?? null);
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "产品/UI报告生成失败。 "); } finally { setGenerating(false); }
  }

  function updateAcceptanceResultDraft(acceptanceId: string, patch: Partial<Omit<AcceptanceResultDraft, "acceptanceId">>) {
    setAcceptanceResultDrafts((current) => current.map((draft) => draft.acceptanceId === acceptanceId ? { ...draft, ...patch } : draft));
  }

  async function importRuntimeEvidenceFile(file: File | null) {
    if (!file || !selectedGroup || !selectedSpec) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("运行证据 JSON 不能超过 5MB。");
      return;
    }
    setError(null);
    try {
      const imported = parseImportedRuntimeEvidence(JSON.parse(await file.text()));
      const run = imported.implementationRun;
      if (!run) throw new Error("运行证据缺少 implementationRun 元数据。");
      // 当前报告的验收只能接收 AgentForge 实施清单分支，基线分支留在实验对照材料中，避免混淆来源。
      if (run.variant !== "agentforge_manifest") throw new Error("当前报告验收只接收 agentforge_manifest 分支的运行证据。");
      if (run.reportGroupId !== selectedGroup.groupId) throw new Error("运行证据所属报告组与当前报告不一致。");
      if (run.solutionId !== selectedSpec.solutionId) throw new Error("运行证据所属方案与当前方案不一致。");
      setLaunchCommand(imported.launchCommand);
      setPreviewUrl(imported.previewUrl);
      setScreenshotPathsText(imported.screenshotPaths.join("\n"));
      setVerificationNotesText(imported.verificationNotes.join("\n"));
      const resultsById = new Map(imported.acceptanceResults.map((item) => [item.acceptanceId, item]));
      setAcceptanceResultDrafts((selectedSpec.acceptanceMatrix ?? []).map((item) => {
        const result = resultsById.get(item.id);
        return {
          acceptanceId: item.id,
          status: result?.status ?? "not_verified",
          note: result?.note ?? "",
          evidencePathsText: result?.evidencePaths.join("\n") ?? "",
        };
      }));
      setImportedImplementationRun(run);
      // 导入真实运行数据不代表人工已经批准该方案，需由操作者显式选择“通过”。
      setFeedbackOutcome("needs_revision");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "运行证据导入失败。");
    } finally {
      if (runtimeEvidenceInputRef.current) runtimeEvidenceInputRef.current.value = "";
    }
  }

  async function saveFeedback() {    const acceptanceResults = acceptanceResultDrafts
      .filter((draft) => draft.status !== "not_verified" || draft.note.trim() || draft.evidencePathsText.trim())
      .map((draft) => ({
        acceptanceId: draft.acceptanceId,
        status: draft.status,
        note: draft.note.trim(),
        evidencePaths: evidenceLines(draft.evidencePathsText),
      }));
    const runtimeEvidence = {
      launchCommand: launchCommand.trim(),
      previewUrl: previewUrl.trim(),
      screenshotPaths: evidenceLines(screenshotPathsText),
      verificationNotes: evidenceLines(verificationNotesText),
      acceptanceResults,
      implementationRun: importedImplementationRun ?? undefined,
    };
    // 已填写的逐项结果必须具备可读结论；通过项还必须附带可复核的证据路径。
    const invalidAcceptanceResult = acceptanceResults.some((result) => result.note.length < 3 || (result.status === "passed" && result.evidencePaths.length === 0));
    if (!selectedGroup || !selectedSpec || !feedbackNote.trim() || !runtimeEvidence.launchCommand || !runtimeEvidence.previewUrl || runtimeEvidence.screenshotPaths.length === 0 || runtimeEvidence.verificationNotes.length === 0) {
      setError("请填写完整的运行验收证据和具体结果。");
      return;
    }
    if (invalidAcceptanceResult || (feedbackOutcome === "pass" ? !acceptancePassReady : !acceptanceRevisionReady)) {
      setError(feedbackOutcome === "pass" ? "只有所有稳定验收项都通过并附带证据后，才能标记为通过。" : "标记为需修改时，至少填写一项失败或未验证的实际结论。");
      return;
    }
    setSavingFeedback(true); setError(null);
    try {
      const response = await fetch(`/api/reports/product-ui/${selectedGroup.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ solutionId: selectedSpec.solutionId, outcome: feedbackOutcome, note: feedbackNote.trim(), runtimeEvidence }) });
      const data = await response.json() as { group?: ReportGroup; error?: { message?: string } };
      if (!response.ok || !data.group) throw new Error(data.error?.message ?? "验收结果保存失败。");
      setGroups((current) => current.map((group) => group.id === data.group!.id ? data.group! : group));
      setFeedbackNote("");
      setLaunchCommand("");
      setPreviewUrl("");
      setScreenshotPathsText("");
      setVerificationNotesText("");
      setAcceptanceResultDrafts((selectedSpec.acceptanceMatrix ?? []).map((item) => ({ acceptanceId: item.id, status: "not_verified", note: "", evidencePathsText: "" })));
    } catch (feedbackError) { setError(feedbackError instanceof Error ? feedbackError.message : "验收结果保存失败。"); } finally { setSavingFeedback(false); }
  }
  async function copyReport() {
    if (!visibleAiExecutionReport) return;
    await navigator.clipboard.writeText(visibleAiExecutionReport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function downloadExperimentPackage() {
    const minimumCaseCount = Number(experimentMinimumCaseCount);
    const minimumRaterCount = Number(experimentMinimumRaterCount);
    if (!selectedGroup || !selectedSpec || !experimentStudyId.trim() || !experimentCaseId.trim() || !experimentProvider.trim() || !experimentModel.trim() || !experimentPromptVersion.trim() || !experimentAdapterVersion.trim() || !Number.isInteger(minimumCaseCount) || minimumCaseCount < 1 || !Number.isInteger(minimumRaterCount) || minimumRaterCount < 1) {
      setError("请填写完整的实验编号、下游模型与最小样本/评分人数。");
      return;
    }
    setExportingExperiment(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/product-ui/${selectedGroup.id}/experiment-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solutionId: selectedSpec.solutionId,
          studyId: experimentStudyId.trim(),
          caseId: experimentCaseId.trim(),
          downstreamModel: { provider: experimentProvider.trim(), model: experimentModel.trim(), promptVersion: experimentPromptVersion.trim(), adapterVersion: experimentAdapterVersion.trim(), parameters: {} },
          minimumCaseCount,
          minimumRaterCount,
          humanReviewRubricVersion: "product-ui-blind-rubric-v1",
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(data?.error?.message ?? "对照实验包导出失败。");
      }
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filename = contentDisposition.match(/filename="?([^";]+)"?/)?.[1] ?? "agentforge-product-ui-experiment.json";
      const downloadUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "对照实验包导出失败。");
    } finally {
      setExportingExperiment(false);
    }
  }

  // 兼容旧版 ReportArtifact：没有产品/UI 报告组时，仍然展示历史报告。
  if (!loading && selectedLegacyReport && !selectedGroup) {
    return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1600px]"><header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles className="h-4 w-4" />AgentForge</div><h1 className="mt-2 text-3xl font-bold tracking-tight">产品/UI实施报告中心</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">历史报告与新的产品/UI实施报告组并存；历史报告仅用于查看旧版本产物。</p></div><button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"><RefreshCw className="h-4 w-4" />刷新</button></header>{error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}<div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]"><aside className="space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold">历史报告（兼容）</h2><div className="mt-3 space-y-2">{legacyReports.map((report) => <button key={report.id} type="button" onClick={() => setSelectedLegacyId(report.id)} className={`w-full rounded-lg border p-3 text-left ${report.id === selectedLegacyId ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{report.title}</p><p className="mt-1 text-xs text-slate-500">v{report.version}</p></button>)}</div></section></aside><section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm"><LegacyReportContent report={selectedLegacyReport} /></section><aside><LegacyReportSidebar report={selectedLegacyReport} /></aside></div></div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles className="h-4 w-4" />AgentForge</div><h1 className="mt-2 text-3xl font-bold tracking-tight">产品/UI 实施报告中心</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">把已评审需求整理成多套可比较、可导出、可交给下游 AI 编程 Agent 的完整实施报告；网站生成后，再回到这里记录真实验收结果。</p></div>
          <div className="flex items-center gap-2">
            <Link href="/workflows" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><GitBranch className="h-4 w-4" />返回工作流</Link>
            <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" title="刷新报告中心"><RefreshCw className="h-4 w-4" />刷新</button>
          </div>
        </header>

        {error && <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}
          <section className="mb-5 grid gap-3 md:grid-cols-3" aria-label="交付边界">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><FileText className="h-4 w-4" />已实现</div>
              <p className="mt-2 text-xs leading-5 text-emerald-800">需求澄清、评审和三套产品/UI 实施报告已生成，可直接复制完整报告或导出 Markdown。</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><GitBranch className="h-4 w-4" />目标设计</div>
              <p className="mt-2 text-xs leading-5 text-indigo-800">将当前报告交给下游 AI 编程 Agent，由下游 Agent 生成真实网站或 UI。</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><CheckCircle2 className="h-4 w-4" />尚未验证</div>
              <p className="mt-2 text-xs leading-5 text-amber-800">真实网站的运行效果、响应式表现和视觉验收，需要生成后回写实际结果。</p>
            </div>
          </section>
          {selectedGroup && <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="三套报告交付总览">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-bold">三套报告交付总览</h2><p className="mt-1 text-xs leading-5 text-slate-500">当前报告组的三种取舍各自独立，可分别交给下游 AI 编程 Agent；这里的“已生成”不代表下游网站已经完成。</p></div>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${groupStatusStyles[selectedGroup.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{groupStatusLabels[selectedGroup.status] ?? selectedGroup.status}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(["experience_first", "visual_first", "engineering_first"] as const).map((solutionId) => {
                const report = selectedGroup.reports.find((item) => item.productUISpec?.solutionId === solutionId);
                const available = Boolean(report?.productUISpec);
                return <button key={solutionId} type="button" onClick={() => setSelectedSolutionId(solutionId)} className={`rounded-lg border p-3 text-left transition ${effectiveSolutionId === solutionId ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{solutionLabels[report?.productUISpec?.solutionType ?? solutionId]}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{available ? "已生成" : "待生成"}</span></div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{report?.productUISpec?.productPositioning ?? "当前报告组暂未提供这套方案。"}</p>
                </button>;
              })}
            </div>
          </section>}
          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">生成报告组</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">必须先完成 Planner、方案评审和必要的人工作决策。每次生成会保留三种独立取舍。</p><label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="review-select">选择已完成评审</label><select id="review-select" value={selectedReviewId} onChange={(event) => setSelectedReviewId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"><option value="">选择工作流</option>{reportableReviews.map((review) => <option key={review.id} value={review.id}>{review.status} · {review.approval.decision ?? "无需裁决"}</option>)}</select><button type="button" disabled={generating || !selectedReviewId} onClick={() => void generate()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "生成中…" : "生成三套实施报告"}</button></section>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">已保存报告组</h2><span className="text-xs text-slate-500">{groups.length} 组</span></div>{loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />加载中</div> : groups.length === 0 ? <div className="py-8 text-center text-sm text-slate-500"><FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />还没有产品/UI报告</div> : <div className="mt-3 space-y-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-lg border p-3 text-left transition ${group.id === selectedGroupId ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold text-slate-800">{group.reports[0]?.productUISpec?.productName ?? "未命名需求"}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${groupStatusStyles[group.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{groupStatusLabels[group.status] ?? group.status}</span></div><p className="mt-2 text-[11px] text-slate-500">{new Date(group.createdAt).toLocaleString("zh-CN")}</p></button>)}</div>}</section>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">历史报告（兼容）</h2><span className="text-xs text-slate-500">{legacyReports.length} 份</span></div>{legacyReports.length === 0 ? <p className="mt-3 text-sm text-slate-500">暂无历史报告。</p> : <div className="mt-3 space-y-2">{legacyReports.map((report) => <button key={report.id} type="button" onClick={() => { setSelectedLegacyId(report.id); setSelectedGroupId(null); }} className={`w-full rounded-lg border p-3 text-left transition ${report.id === selectedLegacyId && !selectedGroup ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold text-slate-800">{report.title}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${legacyStatusStyle[report.status] ?? legacyStatusStyle.inconclusive}`}>{legacyStatusLabel[report.status] ?? report.status}</span></div><p className="mt-2 text-[11px] text-slate-500">v{report.version} · {new Date(report.createdAt).toLocaleString("zh-CN")}</p></button>)}</div>}</section>
          </aside>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            {!selectedGroup || !selectedSpec ? <div className="grid min-h-[650px] place-items-center p-10 text-center"><div><Sparkles className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-bold">选择或生成一组产品/UI报告</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">报告中心会保存多套页面、组件、状态、设计 Token、证据和 AI 执行报告，供实际生成和验收使用。</p></div></div> : <>
              <div className="border-b border-slate-200 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${groupStatusStyles[selectedGroup.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{groupStatusLabels[selectedGroup.status] ?? selectedGroup.status}</span><span className="text-xs text-slate-500">报告组 {selectedGroup.groupId}</span></div><h2 className="mt-3 text-2xl font-bold">{selectedSpec.productName}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selectedSpec.productPositioning}</p></div><div className="flex flex-wrap items-center gap-2"><a className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/api/reports/product-ui/${selectedGroup.id}/export?solutionId=${encodeURIComponent(selectedSpec.solutionId)}`} title="下载当前方案的 Markdown 报告"><Download className="h-4 w-4" />下载 Markdown 报告</a><a className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700" href={`/api/reports/product-ui/${selectedGroup.id}/export?solutionId=${encodeURIComponent(selectedSpec.solutionId)}&format=json`} title="下载当前方案的 JSON 交付包"><FileJson className="h-4 w-4" />下载 JSON 交付包</a></div></div><div className="mt-5 flex flex-wrap gap-2">{selectedGroup.reports.map((report) => { const id = report.productUISpec?.solutionId ?? ""; return <button key={id} type="button" onClick={() => setSelectedSolutionId(id)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${id === selectedSpec.solutionId ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"}`}>{solutionLabels[report.productUISpec?.solutionType ?? ""] ?? report.productUISpec?.solutionType}</button>; })}</div></div>
              <div className="space-y-0 p-5 sm:p-6">
                <Section title="产品范围"><div className="grid gap-5 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">目标用户</p><List items={selectedSpec.targetUsers} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">主要场景</p><List items={selectedSpec.primaryScenarios} /></div></div></Section>
                <Section title={`设计方向：${selectedSpec.designDirection.name}`}><p className="text-sm leading-6 text-slate-700">{selectedSpec.designDirection.positioning}</p><div className="mt-4 grid gap-5 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">视觉原则</p><List items={selectedSpec.designDirection.visualPrinciples} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">布局和组件策略</p><p className="text-sm leading-6 text-slate-700">{selectedSpec.designDirection.layoutStrategy}<br />{selectedSpec.designDirection.componentStrategy}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{Object.entries(selectedSpec.designDirection.tokens).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{key}</p><p className="mt-1 text-xs leading-5 text-slate-700">{value}</p></div>)}</div></Section>
                <Section title="页面清单、实施蓝图与状态"><div className="space-y-3">{selectedSpec.pages.map((page) => <article key={page.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-bold">{page.name}</h4><code className="text-xs text-indigo-600">{page.route}</code></div><p className="mt-2 text-sm leading-6 text-slate-600">{page.purpose}</p><p className="mt-2 text-xs text-slate-500">主操作：{page.primaryAction}</p><div className="mt-3 flex flex-wrap gap-2">{page.requiredStates.map((state) => <span key={state} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{state}</span>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">组件：{page.components.join("、")}</p>{page.blueprint && <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-semibold text-slate-700">实施蓝图</p><p className="mt-2 text-xs leading-5 text-slate-600">布局：{page.blueprint.layout}</p><div className="mt-3 grid gap-4 md:grid-cols-3"><div><p className="text-[11px] font-semibold text-slate-500">首屏</p><List items={page.blueprint.aboveFold} /></div><div><p className="text-[11px] font-semibold text-slate-500">内容规则</p><List items={page.blueprint.contentRules} /></div><div><p className="text-[11px] font-semibold text-slate-500">交互规则</p><List items={page.blueprint.interactionRules} /></div></div>{page.implementationInstructions && <div className="mt-3"><p className="text-[11px] font-semibold text-slate-500">页面实施要求</p><List items={page.implementationInstructions} /></div>}</div>}</article>)}</div></Section>
                <Section title="用户流程与失败恢复"><div className="space-y-4">{selectedSpec.userFlows.map((flow) => <article key={flow.id}><h4 className="font-semibold">{flow.name}</h4><p className="mt-1 text-sm text-slate-600">{flow.goal}</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">{flow.steps.map((step) => <li key={step}>{step}</li>)}</ol><p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">失败恢复：{flow.failureRecovery}</p></article>)}</div></Section>
                <Section title="组件契约"><div className="grid gap-3 md:grid-cols-2">{selectedSpec.components.map((component) => <article key={component.name} className="rounded-lg border border-slate-200 p-4"><h4 className="font-semibold">{component.name}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{component.responsibility}</p><p className="mt-2 text-xs leading-5 text-slate-500">变体：{component.variants.join("、")}<br />状态：{component.states.join("、")}</p><p className="mt-2 text-xs leading-5 text-slate-500">无障碍：{component.accessibility.join("；")}</p></article>)}</div></Section>
                <Section title="响应式、交互与视觉验收"><div className="grid gap-5 md:grid-cols-3"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">响应式</p><List items={selectedSpec.responsiveRules} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">交互状态</p><List items={selectedSpec.interactionStates} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">验收标准</p><List items={selectedSpec.visualAcceptanceCriteria} /></div></div></Section>
                {selectedSpec.acceptanceMatrix && selectedSpec.acceptanceMatrix.length > 0 && <Section title="稳定验收映射"><p className="mb-4 text-sm leading-6 text-slate-600">下游 AI 编程 Agent 必须在运行网站后按以下稳定 ID 回传实际结果、复现方式和真实证据路径。</p><div className="space-y-3">{selectedSpec.acceptanceMatrix.map((item) => <article key={item.id} className="border-b border-slate-200 pb-3 last:border-b-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><code className="text-xs font-semibold text-indigo-600">{item.id}</code><span className="text-[11px] text-slate-500">{item.targetType} · {item.targetId}</span></div><p className="mt-2 text-sm leading-6 text-slate-700">{item.criterion}</p><div className="mt-2 grid gap-2 text-xs leading-5 text-slate-500 md:grid-cols-2"><p>验证方式：{item.verificationMethod}</p><p>真实证据：{item.expectedEvidence}</p></div></article>)}</div></Section>}
                <Section title="交付边界与来源映射"><div className="grid gap-5 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">本方案包含</p><List items={selectedSpec.deliveryBoundary.included} /><p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">本方案不包含</p><List items={selectedSpec.deliveryBoundary.excluded} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">下游交接</p><p className="text-sm leading-6 text-slate-700">{selectedSpec.deliveryBoundary.handoff}</p><div className="mt-4 space-y-2">{selectedSpec.traceability.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{item.area}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">{traceabilityStatusLabels[item.status] ?? item.status}</span></div><p className="mt-2 text-xs leading-5 text-slate-700">{item.statement}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">来源：{item.sourceRefs.map((reference) => `${reference.sourceType}:${reference.refId}`).join("、")}</p></article>)}</div></div></div></Section>
               <Section title="GitHub/UI 参考证据">
                 <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                   <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">证据审计：{evidenceAuditLabels[selectedSpec.evidenceAuditStatus] ?? selectedSpec.evidenceAuditStatus}</span><span>引用状态：{selectedSpec.evidenceStatus === "sha_pinned" ? "SHA 已固定" : "尚未固定"}</span></div>
                   <p className="mt-1">固定 SHA 只保证引用快照可复现，不等于仓库、路径和许可证已经完成真实核验。</p>
                 </div>
                 <div className="space-y-3">
                   {selectedSpec.evidence.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4">
                     <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold">{item.repositoryName}</h4><p className="mt-1 text-xs text-slate-500">{item.path} · {item.commitOrTag}</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">{item.repositoryVerification === "verified" && item.pathVerification === "verified" && item.licenseVerification === "verified" ? "已核验" : "未完成核验"}</span></div>
                     <p className="mt-2 text-sm leading-6 text-slate-600">{item.insight}</p>
                     <p className="mt-2 text-xs text-slate-500">许可证：{item.license} · 复用：{item.reusePolicy}</p>
                     <div className="mt-3 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-3"><span>仓库：{item.repositoryVerification}</span><span>路径：{item.pathVerification}</span><span>许可证：{item.licenseVerification}</span></div>
                   </article>)}
                 </div>
               </Section>
              </div>
            </>}
          </section>

          <aside className="space-y-5">
            {selectedGroup && selectedSpec && <>
               <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clipboard className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">AI 执行报告</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">当前完整报告就是交给 Claude、Codex、Cursor 等 AI 编程工具的实施输入，包含页面、视觉、交互、响应式、证据和验收标准。</p><button type="button" onClick={() => void copyReport()} disabled={!visibleAiExecutionReport} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="复制完整 AI 执行报告">{copied && visibleAiExecutionReport ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}{copied && visibleAiExecutionReport ? "已复制完整报告" : "复制完整 AI 执行报告"}</button><a className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800" href={`/api/reports/product-ui/${selectedGroup.id}/export?solutionId=${encodeURIComponent(selectedSpec.solutionId)}`}><Download className="h-4 w-4" />下载 Markdown 报告</a><a className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/api/reports/product-ui/${selectedGroup.id}/export?format=implementation-manifest&solutionId=${encodeURIComponent(selectedSpec.solutionId)}`}><FileJson className="h-4 w-4" />下载实现包 JSON</a><p className="mt-2 text-[11px] leading-4 text-slate-500">实施包供下游 AI 或自动化读取，描述单一方案的页面、视觉、约束与验收；不代表网站已经生成。</p><div className="mt-3 rounded-lg border border-slate-200 bg-slate-950 p-3"><p className="mb-2 text-[11px] font-semibold text-slate-200">Markdown 预览</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-100" aria-label="AI 执行报告 Markdown">{visibleAiExecutionReport || "正在加载或尚未生成完整报告。"}</pre></div></section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2"><FileJson className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">对照实验包</h2></div>
                <p className="mt-2 text-xs leading-5 text-slate-500">冻结“直接需求”与“AgentForge 实施清单”两条输入，连同验收 ID、哈希和匿名盲评材料导出。下载仅准备实验，不生成网站，也不代表质量已验证。</p>
                <div className="mt-3 grid gap-2">
                  <label className="text-xs font-semibold text-slate-600">研究编号<input value={experimentStudyId} onChange={(event) => setExperimentStudyId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" /></label>
                  <label className="text-xs font-semibold text-slate-600">Case 编号<input value={experimentCaseId} onChange={(event) => setExperimentCaseId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-600">下游 Provider<input value={experimentProvider} onChange={(event) => setExperimentProvider(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" placeholder="openai" /></label>
                    <label className="text-xs font-semibold text-slate-600">下游模型<input value={experimentModel} onChange={(event) => setExperimentModel(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" placeholder="实际模型版本" /></label>
                  </div>
                  <label className="text-xs font-semibold text-slate-600">Prompt 版本<input value={experimentPromptVersion} onChange={(event) => setExperimentPromptVersion(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" /></label>
                   <label className="text-xs font-semibold text-slate-600">生成适配器版本<input value={experimentAdapterVersion} onChange={(event) => setExperimentAdapterVersion(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" placeholder="实际运行器适配器版本" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-600">最少 Case<input type="number" min="1" value={experimentMinimumCaseCount} onChange={(event) => setExperimentMinimumCaseCount(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" /></label>
                    <label className="text-xs font-semibold text-slate-600">最少评分者<input type="number" min="1" value={experimentMinimumRaterCount} onChange={(event) => setExperimentMinimumRaterCount(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500" /></label>
                  </div>
                </div>
                <button type="button" onClick={() => void downloadExperimentPackage()} disabled={exportingExperiment} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{exportingExperiment ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}{exportingExperiment ? "正在打包…" : "下载双分支实验包"}</button>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold">方案取舍</h2><div className="mt-3 space-y-3">{selectedGroup.comparison.map((item) => <div key={item.solutionId} className={`rounded-lg p-3 ${item.solutionId === selectedSpec.solutionId ? "bg-indigo-50" : "bg-slate-50"}`}><p className="text-sm font-semibold">{solutionLabels[selectedGroup.reports.find((report) => report.productUISpec?.solutionId === item.solutionId)?.productUISpec?.solutionType ?? ""] ?? item.solutionId}</p><p className="mt-2 text-xs leading-5 text-emerald-800">优势：{item.strengths.join("；")}</p><p className="mt-1 text-xs leading-5 text-amber-800">取舍：{item.tradeoffs.join("；")}</p></div>)}</div></section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">生成后验收</h2></div>
                <p className="mt-2 text-xs leading-5 text-slate-500">网站实际运行后，记录真实启动信息和验收证据。没有运行证据时不能标记通过。</p>
                <input ref={runtimeEvidenceInputRef} type="file" accept="application/json,.json" aria-label="导入运行证据 JSON" className="sr-only" onChange={(event) => void importRuntimeEvidenceFile(event.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => runtimeEvidenceInputRef.current?.click()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileUp className="h-4 w-4" />导入运行证据 JSON</button>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">仅接收运行器生成且匹配当前报告与方案的 AgentForge 分支证据；导入只回填数据，不会自动保存或标记通过。</p>
                {importedImplementationRun && <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-[11px] leading-5 text-sky-800" aria-live="polite">已导入运行记录：{importedImplementationRun.runId} · {importedImplementationRun.downstreamModel.provider}/{importedImplementationRun.downstreamModel.model} · {importedImplementationRun.exitStatus}</p>}
                {acceptanceMatrix.length > 0 ? (
                  <fieldset className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <legend className="px-1 text-xs font-bold text-slate-700">逐项稳定验收（{acceptanceMatrix.length} 项）</legend>
                    {acceptanceMatrix.map((item) => {
                      const draft = acceptanceResultDrafts.find((result) => result.acceptanceId === item.id) ?? { acceptanceId: item.id, status: "not_verified" as const, note: "", evidencePathsText: "" };
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <code className="text-[11px] font-semibold text-indigo-700">{item.id}</code>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">{item.criterion}</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">核验方式：{item.verificationMethod}</p>
                          <label className="mt-2 block text-xs font-semibold text-slate-600">实际状态
                            <select value={draft.status} onChange={(event) => updateAcceptanceResultDraft(item.id, { status: event.target.value as AcceptanceResultDraft["status"] })} aria-label={`${item.id} 状态`} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-indigo-500">
                              <option value="not_verified">未验证</option>
                              <option value="passed">通过</option>
                              <option value="failed">失败</option>
                            </select>
                          </label>
                          <label className="mt-2 block text-xs font-semibold text-slate-600">实际结论
                            <textarea value={draft.note} onChange={(event) => updateAcceptanceResultDraft(item.id, { note: event.target.value })} aria-label={`${item.id} 验收结论`} className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500" placeholder="记录真实检查结果，不要填写目标设计。" />
                          </label>
                          <label className="mt-2 block text-xs font-semibold text-slate-600">实际证据路径（每行一个）
                            <textarea value={draft.evidencePathsText} onChange={(event) => updateAcceptanceResultDraft(item.id, { evidencePathsText: event.target.value })} aria-label={`${item.id} 证据路径`} className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 p-2 text-xs outline-none focus:border-indigo-500" placeholder="artifacts/home-desktop.png" />
                          </label>
                        </div>
                      );
                    })}
                  </fieldset>
                ) : (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">这是历史报告，没有稳定验收矩阵；系统仅按兼容规则保存运行证据，不能据此证明新报告的逐项验收已经完成。</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setFeedbackOutcome("pass")} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${feedbackOutcome === "pass" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"}`}><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />通过</button>
                  <button type="button" onClick={() => setFeedbackOutcome("needs_revision")} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${feedbackOutcome === "needs_revision" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600"}`}><AlertTriangle className="mx-auto mb-1 h-4 w-4" />需修改</button>
                </div>
                <label className="mt-3 block text-xs font-semibold text-slate-600">实际启动命令<input value={launchCommand} onChange={(event) => setLaunchCommand(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" placeholder="例如 npm run dev" /></label>
                <label className="mt-3 block text-xs font-semibold text-slate-600">实际访问地址<input type="url" value={previewUrl} onChange={(event) => setPreviewUrl(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" placeholder="例如 http://localhost:3000" /></label>
                <label className="mt-3 block text-xs font-semibold text-slate-600">截图路径（每行一个）<textarea value={screenshotPathsText} onChange={(event) => setScreenshotPathsText(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="artifacts/home-desktop.png
artifacts/home-mobile.png" /></label>
                <label className="mt-3 block text-xs font-semibold text-slate-600">测试与验收记录（每行一个）<textarea value={verificationNotesText} onChange={(event) => setVerificationNotesText(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="Chrome 桌面端：首页和表单检查通过。
移动端：布局无溢出。" /></label>
                <textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} className="mt-3 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="补充本次真实验收结论或需要修改的内容" />
                <button type="button" disabled={savingFeedback || !feedbackReady} onClick={() => void saveFeedback()} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{savingFeedback && <Loader2 className="h-4 w-4 animate-spin" />}保存验收结果</button>
                {selectedGroup.feedback.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3">{selectedGroup.feedback.map((item) => <div key={item.solutionId} className="mb-3 text-xs leading-5 text-slate-600"><span className="font-semibold">{item.outcome === "pass" ? "通过" : "需修改"}</span> · {item.note}{item.runtimeEvidence && <div className="mt-1 space-y-1 text-slate-500"><div>地址：{item.runtimeEvidence.previewUrl}</div><div>截图：{item.runtimeEvidence.screenshotPaths.length} 张 · 验收记录：{item.runtimeEvidence.verificationNotes.length} 条</div></div>}</div>)}</div>}
              </section>
            </>}
          </aside>
        </div>
      </div>
    </main>
  );
}
