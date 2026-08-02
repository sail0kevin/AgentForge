"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, Code2, FileCode2, Loader2, Play, ShieldAlert } from "lucide-react";

type Mode = "code-review" | "bug-diagnosis";
type CodeFinding = { id: string; path: string; line: number; severity: string; rule: string; message: string; evidence: string };
type CodeReport = { status: string; filesAnalyzed: number; analysisScope: { reviewGoal: string; evidenceBoundary: string }; findings: CodeFinding[]; suggestions: Array<{ summary: string; steps: string[] }>; limitations: string[] };
type BugCandidate = { id: string; category: string; confidence: string; evidence: string[]; explanation: string };
type BugReport = { status: string; symptom: string; rootCauseCandidates: BugCandidate[]; verificationSteps: Array<{ candidateId: string; action: string; expectedSignal: string }>; repairReport: string[]; limitations: string[] };

const codeExample = "const apiKey = 'abc123456789';\nconsole.log(apiKey);\neval(input);";
const bugExample = "Error: Missing environment variable: DATABASE_URL\n    at createClient (db.ts:12:9)";

function ResultMessage({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null;
}

export function ScenarioCenter() {
  const [mode, setMode] = useState<Mode>("code-review");
  const [path, setPath] = useState("src/example.ts");
  const [code, setCode] = useState("");
  const [goal, setGoal] = useState("");
  const [errorLog, setErrorLog] = useState("");
  const [contextPath, setContextPath] = useState("src/example.ts");
  const [context, setContext] = useState("");
  const [codeReport, setCodeReport] = useState<CodeReport | null>(null);
  const [bugReport, setBugReport] = useState<BugReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function fillExample() {
    setError(null);
    if (mode === "code-review") setCode(codeExample);
    else {
      setErrorLog(bugExample);
      setContext("export const url = process.env.DATABASE_URL;");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError(null);
    setCodeReport(null);
    setBugReport(null);
    try {
      // 仅将当前表单中的受限快照发送到确定性场景 API，不上传或读取本机仓库内容。
      const body = mode === "code-review"
        ? { files: [{ path, content: code }], reviewGoal: goal || undefined }
        : { errorLog, codeContext: [{ path: contextPath, content: context }] };
      const response = await fetch(`/api/scenarios/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { report?: CodeReport | BugReport; error?: { message?: string } };
      if (!response.ok || !data.report) throw new Error(data.error?.message || "分析未完成");
      if (mode === "code-review") setCodeReport(data.report as CodeReport);
      else setBugReport(data.report as BugReport);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "分析未完成");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="secondary-page min-h-screen px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="secondary-header mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">AgentForge</p><h1 className="mt-2 text-3xl font-bold tracking-tight">工程分析</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">提交受限的源码快照或错误日志，获得可追溯的规则证据与下一步验证建议。</p></div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><ShieldAlert className="h-4 w-4" />仅分析提交内容，不读取文件、不执行代码</div>
        </header>
        <div className="mb-5 flex gap-2 border-b border-slate-200" role="tablist" aria-label="分析类型">
          <button type="button" role="tab" aria-selected={mode === "code-review"} onClick={() => { setMode("code-review"); setError(null); }} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${mode === "code-review" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500"}`}><Code2 className="h-4 w-4" />代码审查</button>
          <button type="button" role="tab" aria-selected={mode === "bug-diagnosis"} onClick={() => { setMode("bug-diagnosis"); setError(null); }} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${mode === "bug-diagnosis" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500"}`}><Bug className="h-4 w-4" />问题诊断</button>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
          <form onSubmit={submit} className="secondary-card rounded-2xl border p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold">{mode === "code-review" ? "代码审查输入" : "问题诊断输入"}</h2><p className="mt-1 text-xs text-slate-500">字段均为本次请求快照，不会持久化为仓库。</p></div><button type="button" onClick={fillExample} className="secondary-button h-9 px-3"><FileCode2 className="h-4 w-4" />填充示例</button></div>
            {mode === "code-review" ? <><label className="grid gap-1 text-sm font-semibold">文件路径<input className="field" value={path} onChange={(event) => setPath(event.target.value)} required maxLength={300} /></label><label className="mt-3 grid gap-1 text-sm font-semibold">审查目标<span className="text-xs font-normal text-slate-500">可选</span><input className="field" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} placeholder="例如：关注发布前的凭证与动态执行风险" /></label><label className="mt-3 grid gap-1 text-sm font-semibold">源码快照<textarea className="field min-h-64 font-mono text-xs" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={100000} placeholder="粘贴单个文件的源码" /></label></> : <><label className="grid gap-1 text-sm font-semibold">错误日志<textarea className="field min-h-36 font-mono text-xs" value={errorLog} onChange={(event) => setErrorLog(event.target.value)} required minLength={10} maxLength={50000} placeholder="粘贴错误日志或堆栈" /></label><label className="mt-3 grid gap-1 text-sm font-semibold">上下文文件路径<input className="field" value={contextPath} onChange={(event) => setContextPath(event.target.value)} required maxLength={300} /></label><label className="mt-3 grid gap-1 text-sm font-semibold">代码上下文<textarea className="field min-h-40 font-mono text-xs" value={context} onChange={(event) => setContext(event.target.value)} required maxLength={100000} placeholder="粘贴与错误路径相关的代码" /></label></>}
            <ResultMessage error={error} /><button type="submit" disabled={running} className="primary-button mt-4 h-10 w-full">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{running ? "分析中…" : "运行分析"}</button>
          </form>
          <section className="secondary-card min-w-0 rounded-2xl border p-5 shadow-sm" aria-live="polite">
            {!codeReport && !bugReport ? <div className="grid min-h-[420px] place-items-center text-center text-slate-500"><div><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 text-sm font-semibold">等待一次分析</p><p className="mt-1 text-xs">结果将显示直接证据、候选结论和验证边界。</p></div></div> : codeReport ? <CodeResult report={codeReport} /> : <BugResult report={bugReport!} />}
          </section>
        </div>
      </div>
    </main>
  );
}

function CodeResult({ report }: { report: CodeReport }) {
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">代码审查结果</p><h2 className="mt-1 text-xl font-bold">{report.status === "clean" ? "未发现当前规则命中" : `发现 ${report.findings.length} 个待关注项`}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${report.status === "clean" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{report.status === "clean" ? "当前快照干净" : "需要关注"}</span></div><p className="mt-3 text-sm text-slate-600">分析文件：{report.filesAnalyzed} · 证据边界：直接源码模式</p><div className="mt-5 space-y-3">{report.findings.map((finding) => <article key={finding.id} className="soft-card rounded-lg p-3"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold text-red-700">{finding.severity}</span><code>{finding.rule}</code><span className="text-slate-500">{finding.path}:{finding.line}</span></div><p className="mt-2 text-sm font-semibold">{finding.message}</p><pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{finding.evidence}</pre></article>)}</div>{report.suggestions.length > 0 && <div className="mt-5"><h3 className="font-bold">候选处置方向</h3><div className="mt-2 space-y-2">{report.suggestions.map((suggestion) => <div key={suggestion.summary} className="soft-card rounded-lg p-3 text-sm"><p className="font-semibold">{suggestion.summary}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{suggestion.steps.map((step) => <li key={step}>{step}</li>)}</ul></div>)}</div></div>}<Limitations items={report.limitations} /></div>;
}

function BugResult({ report }: { report: BugReport }) {
  // 候选根因和验证计划分区呈现，避免将日志模式命中暗示为已证实的修复结论。
  return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">问题诊断结果</p><h2 className="mt-1 text-xl font-bold">{report.status === "candidate_found" ? "找到候选根因" : "证据不足"}</h2></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{report.status}</span></div><div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold">症状：</span>{report.symptom}</div><div className="mt-5 space-y-3">{report.rootCauseCandidates.map((candidate) => <article key={candidate.id} className="soft-card rounded-lg p-3"><div className="flex flex-wrap gap-2 text-xs font-semibold"><span>{candidate.category}</span><span className="text-violet-700">{candidate.confidence}</span></div><p className="mt-2 text-sm">{candidate.explanation}</p><ul className="mt-2 list-disc pl-5 text-xs text-slate-600">{candidate.evidence.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div><div className="mt-5"><h3 className="font-bold">验证步骤</h3><div className="mt-2 space-y-2">{report.verificationSteps.map((step) => <div key={step.candidateId} className="soft-card rounded-lg p-3 text-sm"><p>{step.action}</p><p className="mt-1 text-xs text-emerald-700">预期信号：{step.expectedSignal}</p></div>)}</div></div><div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">修复边界</p>{report.repairReport.map((item) => <p key={item} className="mt-1">{item}</p>)}</div><Limitations items={report.limitations} /></div>;
}

function Limitations({ items }: { items: string[] }) {
  return <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-600"><CheckCircle2 className="h-4 w-4" />证据与局限性</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-500">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
