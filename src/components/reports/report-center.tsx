"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, ClipboardCheck, Download, FileText, GitBranch, Loader2, RefreshCw, Scale, ShieldAlert, Sparkles } from "lucide-react";

type Evidence = { id: string; repositoryName: string; repositoryUrl: string; commitOrTag: string; path: string; license: string; evidenceStatus?: string; reusePolicy: string; insight: string };
type ProductUISpec = {
  solutionId: string;
  solutionType: string;
  productName: string;
  productPositioning: string;
  targetUsers: string[];
  primaryScenarios: string[];
  pages: Array<{ id: string; name: string; route: string; purpose: string; primaryAction: string; sections: string[]; requiredStates: string[]; components: string[]; acceptanceCriteria: string[] }>;
  userFlows: Array<{ id: string; name: string; goal: string; steps: string[]; failureRecovery: string }>;
  designDirection: { name: string; positioning: string; visualPrinciples: string[]; layoutStrategy: string; componentStrategy: string; avoid: string[]; tokens: Record<string, string> };
  components: Array<{ name: string; responsibility: string; variants: string[]; states: string[]; accessibility: string[] }>;
  responsiveRules: string[];
  interactionStates: string[];
  implementationConstraints: string[];
  visualAcceptanceCriteria: string[];
  evidence: Evidence[];
  evidenceStatus: string;
};
type ProductUIReport = { id: string; title: string; executiveSummary: string; productUISpec?: ProductUISpec };
type Feedback = { solutionId: string; outcome: "pass" | "needs_revision"; note: string; checkedAt: string };
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
const groupStatusLabels: Record<string, string> = { generated: "已生成", in_review: "验收中", accepted: "已验收", needs_revision: "需要修改" };
const groupStatusStyles: Record<string, string> = { generated: "border-sky-200 bg-sky-50 text-sky-700", in_review: "border-amber-200 bg-amber-50 text-amber-800", accepted: "border-emerald-200 bg-emerald-50 text-emerald-700", needs_revision: "border-red-200 bg-red-50 text-red-700" };

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
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackOutcome, setFeedbackOutcome] = useState<Feedback["outcome"]>("pass");
  const [savingFeedback, setSavingFeedback] = useState(false);
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
      setSelectedGroupId((current) => current && groupData.groups.some((group) => group.id === current) ? current : groupData.groups[0]?.id ?? null);
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
  const reportableReviews = reviews.filter((review) => review.approval.status !== "pending" && review.status !== "needs_human");

  useEffect(() => {
    if (!selectedGroup || !selectedSpec) return;
    const controller = new AbortController();
    void fetch(`/api/reports/product-ui/${selectedGroup.id}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("方案详情加载失败。 ");
      const data = await response.json() as { prompts: Array<{ solutionId: string; prompt: string }> };
      setPrompt(data.prompts.find((item) => item.solutionId === selectedSpec.solutionId)?.prompt ?? "");
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

  async function saveFeedback() {
    if (!selectedGroup || !selectedSpec || !feedbackNote.trim()) { setError("请填写本次运行验收的具体结果。 "); return; }
    setSavingFeedback(true); setError(null);
    try {
      const response = await fetch(`/api/reports/product-ui/${selectedGroup.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ solutionId: selectedSpec.solutionId, outcome: feedbackOutcome, note: feedbackNote.trim() }) });
      const data = await response.json() as { group?: ReportGroup; error?: { message?: string } };
      if (!response.ok || !data.group) throw new Error(data.error?.message ?? "验收结果保存失败。 ");
      setGroups((current) => current.map((group) => group.id === data.group!.id ? data.group! : group));
      setFeedbackNote("");
    } catch (feedbackError) { setError(feedbackError instanceof Error ? feedbackError.message : "验收结果保存失败。 "); } finally { setSavingFeedback(false); }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  // 兼容旧版 ReportArtifact：没有产品/UI 报告组时，仍然展示历史报告。
  if (!loading && selectedLegacyReport && !selectedGroup) {
    return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1600px]"><header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles className="h-4 w-4" />AgentForge</div><h1 className="mt-2 text-3xl font-bold tracking-tight">产品/UI实施报告中心</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">同时支持历史动态开发报告与新的产品/UI实施报告组。</p></div><button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"><RefreshCw className="h-4 w-4" />刷新</button></header>{error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}<div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]"><aside className="space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold">传统动态报告</h2><div className="mt-3 space-y-2">{legacyReports.map((report) => <button key={report.id} type="button" onClick={() => setSelectedLegacyId(report.id)} className={`w-full rounded-lg border p-3 text-left ${report.id === selectedLegacyId ? "border-indigo-300 bg-indigo-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{report.title}</p><p className="mt-1 text-xs text-slate-500">v{report.version}</p></button>)}</div></section></aside><section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm"><LegacyReportContent report={selectedLegacyReport} /></section><aside><LegacyReportSidebar report={selectedLegacyReport} /></aside></div></div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles className="h-4 w-4" />AgentForge</div><h1 className="mt-2 text-3xl font-bold tracking-tight">产品/UI 实施报告中心</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">把已评审需求整理成多套可比较、可导出、可交给下游 AI 编程 Agent 的完整实现规格；网站生成后，再回到这里记录真实验收结果。</p></div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" title="刷新报告中心"><RefreshCw className="h-4 w-4" />刷新</button>
        </header>

        {error && <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">生成报告组</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">必须先完成 Planner、方案评审和必要的人工作决策。每次生成会保留三种独立取舍。</p><label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="review-select">选择已完成评审</label><select id="review-select" value={selectedReviewId} onChange={(event) => setSelectedReviewId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"><option value="">选择工作流</option>{reportableReviews.map((review) => <option key={review.id} value={review.id}>{review.status} · {review.approval.decision ?? "无需裁决"}</option>)}</select><button type="button" disabled={generating || !selectedReviewId} onClick={() => void generate()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "生成中…" : "生成三套实施报告"}</button></section>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">已保存报告组</h2><span className="text-xs text-slate-500">{groups.length} 组</span></div>{loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />加载中</div> : groups.length === 0 ? <div className="py-8 text-center text-sm text-slate-500"><FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />还没有产品/UI报告</div> : <div className="mt-3 space-y-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-lg border p-3 text-left transition ${group.id === selectedGroupId ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold text-slate-800">{group.reports[0]?.productUISpec?.productName ?? "未命名需求"}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${groupStatusStyles[group.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{groupStatusLabels[group.status] ?? group.status}</span></div><p className="mt-2 text-[11px] text-slate-500">{new Date(group.createdAt).toLocaleString("zh-CN")}</p></button>)}</div>}</section>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">传统动态报告</h2><span className="text-xs text-slate-500">{legacyReports.length} 份</span></div>{legacyReports.length === 0 ? <p className="mt-3 text-sm text-slate-500">暂无传统报告。</p> : <div className="mt-3 space-y-2">{legacyReports.map((report) => <button key={report.id} type="button" onClick={() => { setSelectedLegacyId(report.id); setSelectedGroupId(null); }} className={`w-full rounded-lg border p-3 text-left transition ${report.id === selectedLegacyId && !selectedGroup ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold text-slate-800">{report.title}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${legacyStatusStyle[report.status] ?? legacyStatusStyle.inconclusive}`}>{legacyStatusLabel[report.status] ?? report.status}</span></div><p className="mt-2 text-[11px] text-slate-500">v{report.version} · {new Date(report.createdAt).toLocaleString("zh-CN")}</p></button>)}</div>}</section>
          </aside>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            {!selectedGroup || !selectedSpec ? <div className="grid min-h-[650px] place-items-center p-10 text-center"><div><Sparkles className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-bold">选择或生成一组产品/UI报告</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">报告中心会保存多套页面、组件、状态、设计 Token、证据和下游 Prompt，供实际生成和验收使用。</p></div></div> : <>
              <div className="border-b border-slate-200 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${groupStatusStyles[selectedGroup.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{groupStatusLabels[selectedGroup.status] ?? selectedGroup.status}</span><span className="text-xs text-slate-500">报告组 {selectedGroup.groupId}</span></div><h2 className="mt-3 text-2xl font-bold">{selectedSpec.productName}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selectedSpec.productPositioning}</p></div><a className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700" href={`/api/reports/product-ui/${selectedGroup.id}/export`}><Download className="h-4 w-4" />导出整组 Markdown</a></div><div className="mt-5 flex flex-wrap gap-2">{selectedGroup.reports.map((report) => { const id = report.productUISpec?.solutionId ?? ""; return <button key={id} type="button" onClick={() => setSelectedSolutionId(id)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${id === selectedSpec.solutionId ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"}`}>{solutionLabels[report.productUISpec?.solutionType ?? ""] ?? report.productUISpec?.solutionType}</button>; })}</div></div>
              <div className="space-y-0 p-5 sm:p-6">
                <Section title="产品范围"><div className="grid gap-5 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">目标用户</p><List items={selectedSpec.targetUsers} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">主要场景</p><List items={selectedSpec.primaryScenarios} /></div></div></Section>
                <Section title={`设计方向：${selectedSpec.designDirection.name}`}><p className="text-sm leading-6 text-slate-700">{selectedSpec.designDirection.positioning}</p><div className="mt-4 grid gap-5 md:grid-cols-2"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">视觉原则</p><List items={selectedSpec.designDirection.visualPrinciples} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">布局和组件策略</p><p className="text-sm leading-6 text-slate-700">{selectedSpec.designDirection.layoutStrategy}<br />{selectedSpec.designDirection.componentStrategy}</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{Object.entries(selectedSpec.designDirection.tokens).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{key}</p><p className="mt-1 text-xs leading-5 text-slate-700">{value}</p></div>)}</div></Section>
                <Section title="页面清单与状态"><div className="space-y-3">{selectedSpec.pages.map((page) => <article key={page.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-bold">{page.name}</h4><code className="text-xs text-indigo-600">{page.route}</code></div><p className="mt-2 text-sm leading-6 text-slate-600">{page.purpose}</p><p className="mt-2 text-xs text-slate-500">主操作：{page.primaryAction}</p><div className="mt-3 flex flex-wrap gap-2">{page.requiredStates.map((state) => <span key={state} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{state}</span>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">组件：{page.components.join("、")}</p></article>)}</div></Section>
                <Section title="用户流程与失败恢复"><div className="space-y-4">{selectedSpec.userFlows.map((flow) => <article key={flow.id}><h4 className="font-semibold">{flow.name}</h4><p className="mt-1 text-sm text-slate-600">{flow.goal}</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">{flow.steps.map((step) => <li key={step}>{step}</li>)}</ol><p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">失败恢复：{flow.failureRecovery}</p></article>)}</div></Section>
                <Section title="组件契约"><div className="grid gap-3 md:grid-cols-2">{selectedSpec.components.map((component) => <article key={component.name} className="rounded-lg border border-slate-200 p-4"><h4 className="font-semibold">{component.name}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{component.responsibility}</p><p className="mt-2 text-xs leading-5 text-slate-500">变体：{component.variants.join("、")}<br />状态：{component.states.join("、")}</p><p className="mt-2 text-xs leading-5 text-slate-500">无障碍：{component.accessibility.join("；")}</p></article>)}</div></Section>
                <Section title="响应式、交互与视觉验收"><div className="grid gap-5 md:grid-cols-3"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">响应式</p><List items={selectedSpec.responsiveRules} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">交互状态</p><List items={selectedSpec.interactionStates} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">验收标准</p><List items={selectedSpec.visualAcceptanceCriteria} /></div></div></Section>
                <Section title="GitHub/UI 参考证据"><div className="space-y-3">{selectedSpec.evidence.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-semibold">{item.repositoryName}</h4><p className="mt-1 text-xs text-slate-500">{item.path} · {item.commitOrTag}</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">{selectedSpec.evidenceStatus === "sha_pinned" ? "SHA 已固定" : "尚未验证"}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{item.insight}</p><p className="mt-2 text-xs text-slate-500">许可证：{item.license} · 复用：{item.reusePolicy}</p></article>)}</div></Section>
              </div>
            </>}
          </section>

          <aside className="space-y-5">
            {selectedGroup && selectedSpec && <>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clipboard className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">下游 Prompt</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">把当前方案交给 AI 编程 Agent 时使用。它只描述目标设计，不声称网站已经生成。</p><button type="button" onClick={() => void copyPrompt()} disabled={!prompt} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="复制下游 Prompt">{copied ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}{copied ? "已复制" : "复制当前 Prompt"}</button><a className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800" href={`/api/reports/product-ui/${selectedGroup.id}/export?solutionId=${encodeURIComponent(selectedSpec.solutionId)}`}><Download className="h-4 w-4" />导出当前方案</a></section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold">方案取舍</h2><div className="mt-3 space-y-3">{selectedGroup.comparison.map((item) => <div key={item.solutionId} className={`rounded-lg p-3 ${item.solutionId === selectedSpec.solutionId ? "bg-indigo-50" : "bg-slate-50"}`}><p className="text-sm font-semibold">{solutionLabels[selectedGroup.reports.find((report) => report.productUISpec?.solutionId === item.solutionId)?.productUISpec?.solutionType ?? ""] ?? item.solutionId}</p><p className="mt-2 text-xs leading-5 text-emerald-800">优势：{item.strengths.join("；")}</p><p className="mt-1 text-xs leading-5 text-amber-800">取舍：{item.tradeoffs.join("；")}</p></div>)}</div></section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-600" /><h2 className="font-bold">生成后验收</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">网站实际运行后，按当前方案记录通过或需要修改的结果。没有运行证据时不要标记通过。</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setFeedbackOutcome("pass")} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${feedbackOutcome === "pass" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600"}`}><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />通过</button><button type="button" onClick={() => setFeedbackOutcome("needs_revision")} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${feedbackOutcome === "needs_revision" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600"}`}><AlertTriangle className="mx-auto mb-1 h-4 w-4" />需修改</button></div><textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} className="mt-3 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500" placeholder="记录浏览器、页面、响应式或视觉验收中的真实结果" /><button type="button" disabled={savingFeedback || !feedbackNote.trim()} onClick={() => void saveFeedback()} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{savingFeedback && <Loader2 className="h-4 w-4 animate-spin" />}保存验收结果</button>{selectedGroup.feedback.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3">{selectedGroup.feedback.map((item) => <div key={item.solutionId} className="mb-2 text-xs leading-5 text-slate-600"><span className="font-semibold">{item.outcome === "pass" ? "通过" : "需修改"}</span> · {item.note}</div>)}</div>}</section>
            </>}
          </aside>
        </div>
      </div>
    </main>
  );
}
