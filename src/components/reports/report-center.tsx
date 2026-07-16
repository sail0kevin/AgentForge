"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Download, FileText, GitBranch, Loader2, RefreshCw, Scale, ShieldAlert } from "lucide-react";
import Link from "next/link";

type SourceRef = { sourceType: string; refId: string; label: string; locator: string | null; usedByClaimIds: string[] };
type Claim = { id: string; kind: string; statement: string; confidence: string; sourceRefs: Array<Omit<SourceRef, "usedByClaimIds">> };
type Chapter = { id: string; title: string; order: number; purpose: string; summary: string; claims: Claim[] };
type ReportRecord = {
  id: string; reviewWorkflowId: string; parentReportId: string | null; version: number; status: string; title: string;
  executiveSummary: string; createdAt: string;
  content: { decisionSummary: string; sections: Chapter[]; assumptions: Claim[]; risks: Claim[]; unresolvedItems: Claim[]; sourceManifest: SourceRef[] };
};
type ReviewRecord = { id: string; status: string; approval: { status: string; decision: string | null; note: string | null } };

const statusStyle: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-red-200 bg-red-50 text-red-700",
  inconclusive: "border-slate-300 bg-slate-100 text-slate-700",
};
const statusLabel: Record<string, string> = { completed: "已完成", partial: "部分完成", blocked: "已阻塞", inconclusive: "不可裁决" };
const kindLabel: Record<string, string> = { fact: "事实", assumption: "假设", recommendation: "建议", risk: "风险", tradeoff: "取舍", open_question: "待确认" };

function ClaimList({ claims, empty = "无" }: { claims: Claim[]; empty?: string }) {
  if (claims.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="space-y-3">
      {claims.map((claim) => (
        <article key={claim.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-violet-50 px-2 py-1 font-semibold text-violet-700">{kindLabel[claim.kind] ?? claim.kind}</span>
            <span className="text-slate-500">置信度：{claim.confidence}</span>
          </div>
          <p className="text-sm leading-6 text-slate-800">{claim.statement}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {claim.sourceRefs.map((source) => <code key={`${source.sourceType}:${source.refId}`} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{source.sourceType}:{source.refId}</code>)}
          </div>
        </article>
      ))}
    </div>
  );
}

export function ReportCenter() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportResponse, reviewResponse] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/reviews", { cache: "no-store" }),
      ]);
      if (reportResponse.status === 401 || reviewResponse.status === 401) throw new Error("请先返回工作台登录。 ");
      if (!reportResponse.ok || !reviewResponse.ok) throw new Error("报告数据加载失败。 ");
      const reportData = await reportResponse.json() as { reports: ReportRecord[] };
      const reviewData = await reviewResponse.json() as { reviews: ReviewRecord[] };
      setReports(reportData.reports);
      setReviews(reviewData.reviews);
      setSelectedId((current) => current && reportData.reports.some((report) => report.id === current) ? current : reportData.reports[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "报告数据加载失败。 ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(() => reports.find((report) => report.id === selectedId) ?? null, [reports, selectedId]);
  const reportableReviews = reviews.filter((review) => review.approval.status !== "pending" && review.status !== "needs_human");

  async function generate(reviewWorkflowId: string) {
    setGenerating(reviewWorkflowId);
    setError(null);
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewWorkflowId, generationKey: crypto.randomUUID() }) });
      const data = await response.json().catch(() => null) as { report?: ReportRecord; error?: { message?: string } } | null;
      if (!response.ok || !data?.report) throw new Error(data?.error?.message || "报告生成失败。 ");
      await load();
      setSelectedId(data.report.id);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "报告生成失败。 ");
    } finally {
      setGenerating(null);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600"><div className="flex items-center gap-2"><Loader2 className="animate-spin" />正在加载报告中心…</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="icon-button" aria-label="返回工作台"><ArrowLeft /></Link>
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">AgentForge</p><h1 className="text-xl font-bold">动态开发报告中心</h1></div>
          </div>
          <div className="flex gap-2"><Link href="/workflows" className="secondary-button h-9 px-3"><GitBranch />开发工作流</Link><button type="button" className="secondary-button h-9 px-3" onClick={() => void load()}><RefreshCw />刷新</button></div>
        </div>
      </header>

      {error && <div role="alert" className="mx-auto mt-4 max-w-[1500px] rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-violet-600" /><h2 className="font-bold">报告版本</h2></div>
            {reports.length === 0 ? <p className="text-sm leading-6 text-slate-500">暂无报告。先完成计划、交叉评审和必要的人工确认。</p> : (
              <div className="space-y-2">
                {reports.map((report) => <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === report.id ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-violet-700">v{report.version}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle[report.status] ?? statusStyle.inconclusive}`}>{statusLabel[report.status] ?? report.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-semibold">{report.title}</p><p className="mt-1 text-xs text-slate-500">{new Date(report.createdAt).toLocaleString("zh-CN")}</p></button>)}
              </div>
            )}
          </section>
          {reportableReviews.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold">从评审生成新版本</h2><p className="mt-1 text-xs leading-5 text-slate-500">每次生成都是不可变的新版本，不会覆盖旧报告。</p><div className="mt-3 space-y-2">{reportableReviews.slice(0, 6).map((review) => <button key={review.id} type="button" disabled={generating !== null} onClick={() => void generate(review.id)} className="secondary-button min-h-10 w-full justify-start px-3 text-left"><BookOpen />{generating === review.id ? "生成中…" : `${review.status} · ${review.approval.decision ?? "无需裁决"}`}</button>)}</div></section>}
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selected ? <div className="grid min-h-[560px] place-items-center p-10 text-center"><div><FileText className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-bold">还没有可阅读的报告</h2><p className="mt-2 text-sm text-slate-500">完成 Review 后可在左侧生成第一个版本。</p></div></div> : <>
            <div className="border-b border-slate-200 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle[selected.status] ?? statusStyle.inconclusive}`}>{statusLabel[selected.status] ?? selected.status}</span><span className="text-xs text-slate-500">v{selected.version}{selected.parentReportId ? " · 有上一版本" : " · 初始版本"}</span></div><h2 className="mt-3 text-2xl font-bold tracking-tight">{selected.title}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{selected.executiveSummary}</p></div><a className="primary-button h-10 px-4" href={`/api/reports/${selected.id}/export`}><Download />导出 Markdown</a></div>
            </div>
            <div className="space-y-8 p-6">
              <section className="rounded-xl border border-violet-200 bg-violet-50 p-5"><div className="flex items-center gap-2 font-bold text-violet-900"><Scale className="h-5 w-5" />最终决策</div><p className="mt-2 text-sm leading-7 text-violet-900">{selected.content.decisionSummary}</p></section>
              {[...selected.content.sections].sort((a, b) => a.order - b.order).map((chapter) => <section key={chapter.id} id={`chapter-${chapter.id}`} className="scroll-mt-4"><p className="text-xs font-bold uppercase tracking-wider text-violet-600">第 {chapter.order} 章</p><h3 className="mt-1 text-xl font-bold">{chapter.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{chapter.summary}</p><div className="mt-4"><ClaimList claims={chapter.claims} /></div></section>)}
              <section><div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h3 className="text-lg font-bold">风险</h3></div><ClaimList claims={selected.content.risks} /></section>
              <section><div className="mb-3 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-slate-600" /><h3 className="text-lg font-bold">假设与未决事项</h3></div><ClaimList claims={[...selected.content.assumptions, ...selected.content.unresolvedItems]} /></section>
            </div>
          </>}
        </section>

        <aside>{selected && <div className="sticky top-5 space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold">动态目录</h2><nav className="mt-3 space-y-1">{[...selected.content.sections].sort((a, b) => a.order - b.order).map((chapter) => <a key={chapter.id} href={`#chapter-${chapter.id}`} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-violet-700">{chapter.order}. {chapter.title}</a>)}</nav></section><section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><h2 className="font-bold">来源清单</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">点击正文中的来源编号，可在这里核对类型和用途。</p><div className="mt-3 max-h-[430px] space-y-2 overflow-auto">{selected.content.sourceManifest.map((source) => <div key={`${source.sourceType}:${source.refId}`} className="rounded-lg bg-slate-50 p-3"><code className="break-all text-[11px] font-semibold text-violet-700">{source.sourceType}:{source.refId}</code><p className="mt-1 text-xs leading-5 text-slate-600">{source.label}</p><p className="mt-1 text-[10px] text-slate-400">引用 {source.usedByClaimIds.length} 次</p></div>)}</div></section></div>}</aside>
      </div>
    </main>
  );
}
