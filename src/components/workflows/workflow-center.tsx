"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, FileText, GitBranch, HelpCircle, Loader2, PauseCircle, Play, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";

type WorkflowNode = {
  key: string; order: number; status: string; attempt: number; artifactType: string | null; artifactId: string | null;
  summary: string | null; errorCode: string | null; startedAt: string | null; finishedAt: string | null;
};
type InterruptPayload =
  | { kind: "clarification"; questions: string[]; round: number; maxRounds: number }
  | { kind: "approval"; reviewWorkflowId: string; decisions: string[] };
type WorkflowRecord = {
  id: string; threadId: string; status: string; currentNode: string; requirement: string; mode: string; nodes: WorkflowNode[];
  agents: WorkflowAgentConfig;
  interrupt: InterruptPayload | null; checkpoint: { id: string; namespace: string } | null; lastErrorCode: string | null;
  leaseExpiresAt: string | null; recoveryAvailable: boolean;
  artifacts: {
    plan: { id: string; status: string; createdAt: string } | null;
    review: { id: string; status: string; approvalStatus: string; approvalDecision: string | null; createdAt: string } | null;
    report: { id: string; status: string; version: number; title: string; createdAt: string } | null;
  };
  createdAt: string; updatedAt: string;
};
type AgentOption = { id: string; name: string; provider: string; model: string; credentialConfigured: boolean };
type WorkflowAgentConfig = {
  plannerAgentId?: string;
  candidateAgentIds?: [string, string];
  reviewerAgentId?: string;
  evaluatorAgentId?: string;
  reporterAgentId?: string;
};

const statusText: Record<string, string> = {
  pending: "等待", running: "执行中", needs_clarification: "等待补充", needs_human: "等待裁决", completed: "已完成",
  partial: "部分完成", blocked: "已阻塞", inconclusive: "不可裁决", failed: "失败", waiting: "等待输入", skipped: "已跳过",
};
const statusColor: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  needs_clarification: "border-amber-200 bg-amber-50 text-amber-800",
  needs_human: "border-violet-200 bg-violet-50 text-violet-700",
  waiting: "border-violet-200 bg-violet-50 text-violet-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
  inconclusive: "border-slate-300 bg-slate-100 text-slate-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-500",
  pending: "border-slate-200 bg-white text-slate-500",
};

const DEMO_REQUIREMENT = "为大学运营团队建设内容管理后台，需要角色权限、审核流程、操作审计、可访问性和分阶段交付。";

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="text-emerald-600" />;
  if (status === "running") return <Loader2 className="animate-spin text-blue-600" />;
  if (status === "waiting" || status.startsWith("needs_")) return <PauseCircle className="text-violet-600" />;
  if (status === "failed" || status === "blocked") return <XCircle className="text-red-600" />;
  if (status === "partial" || status === "inconclusive") return <AlertTriangle className="text-amber-600" />;
  return <CircleDashed className="text-slate-400" />;
}

function RoleSelect({ label, agents, value, onChange }: {
  label: string;
  agents: AgentOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return <label className="grid gap-1 text-[11px] font-semibold text-violet-950">{label}<select className="field h-9 bg-white text-xs" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">请选择</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.provider}/{agent.model}{agent.credentialConfigured ? "" : " · 未配置凭证"}</option>)}</select></label>;
}

export function WorkflowCenter() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requirement, setRequirement] = useState("");
  const [mode, setMode] = useState<"baseline" | "model">("baseline");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentConfig, setAgentConfig] = useState<WorkflowAgentConfig>({});
  const [answer, setAnswer] = useState("");
  const [approval, setApproval] = useState<"delivery" | "quality" | "hybrid" | "reject">("hybrid");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, agentsResponse] = await Promise.all([
        fetch("/api/workflows", { cache: "no-store" }),
        fetch("/api/agents", { cache: "no-store" }),
      ]);
      const data = await response.json().catch(() => null) as { workflows?: WorkflowRecord[]; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflows) throw new Error(data?.error?.message || "工作流加载失败。 ");
      const agentData = await agentsResponse.json().catch(() => null) as AgentOption[] | null;
      if (agentsResponse.ok && Array.isArray(agentData)) {
        setAgents(agentData);
        setAgentConfig((current) => {
          if (current.plannerAgentId || agentData.length === 0) return current;
          const first = agentData[0].id;
          const second = agentData[1]?.id ?? first;
          return { plannerAgentId: first, candidateAgentIds: [first, second], reviewerAgentId: first, evaluatorAgentId: first, reporterAgentId: first };
        });
      }
      setWorkflows(data.workflows);
      setSelectedId((current) => current && data.workflows!.some((item) => item.id === current) ? current : data.workflows![0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "工作流加载失败。 ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(() => workflows.find((item) => item.id === selectedId) ?? null, [selectedId, workflows]);
  const modelReady = Boolean(
    agentConfig.plannerAgentId && agentConfig.candidateAgentIds?.[0] && agentConfig.candidateAgentIds[1]
    && agentConfig.reviewerAgentId && agentConfig.evaluatorAgentId && agentConfig.reporterAgentId,
  );

  function updateAgentRole(key: Exclude<keyof WorkflowAgentConfig, "candidateAgentIds">, value: string) {
    setAgentConfig((current) => ({ ...current, [key]: value }));
  }

  function updateCandidate(index: 0 | 1, value: string) {
    setAgentConfig((current) => {
      const pair: [string, string] = current.candidateAgentIds ?? ["", ""];
      const next: [string, string] = [...pair];
      next[index] = value;
      return { ...current, candidateAgentIds: next };
    });
  }

  async function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement, mode, agents: mode === "model" ? agentConfig : {} }),
      });
      const data = await response.json().catch(() => null) as { workflow?: WorkflowRecord; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflow) throw new Error(data?.error?.message || "工作流创建失败。 ");
      setRequirement("");
      await load();
      setSelectedId(data.workflow.id);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "工作流创建失败。 "); }
    finally { setSubmitting(false); }
  }

  async function recoverWorkflow() {
    if (!selected) return;
    setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/workflows/${selected.id}/recover`, { method: "POST" });
      const data = await response.json().catch(() => null) as { workflow?: WorkflowRecord; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflow) throw new Error(data?.error?.message || "工作流恢复失败。 ");
      await load();
      setSelectedId(data.workflow.id);
    } catch (recoverError) { setError(recoverError instanceof Error ? recoverError.message : "工作流恢复失败。 "); }
    finally { setSubmitting(false); }
  }

  async function resumeWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.interrupt) return;
    setSubmitting(true); setError(null);
    const payload = selected.interrupt.kind === "clarification"
      ? { kind: "clarification", answer }
      : { kind: "approval", decision: approval, ...(note.trim() ? { note: note.trim() } : {}) };
    try {
      const response = await fetch(`/api/workflows/${selected.id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null) as { workflow?: WorkflowRecord; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflow) throw new Error(data?.error?.message || "Checkpoint恢复失败。 ");
      setAnswer(""); setNote("");
      await load();
      setSelectedId(data.workflow.id);
    } catch (resumeError) { setError(resumeError instanceof Error ? resumeError.message : "Checkpoint恢复失败。 "); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4"><Link href="/" className="icon-button" aria-label="返回工作台"><ArrowLeft /></Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">AgentForge</p><h1 className="text-xl font-bold">开发工作流</h1><p className="mt-1 text-xs text-slate-500">需求 → Planner → 交叉评审 → 人工确认 → 动态报告</p></div></div>
          <div className="flex gap-2"><Link href="/reports" className="secondary-button h-9 px-3"><FileText />报告中心</Link><button type="button" className="secondary-button h-9 px-3" onClick={() => void load()}><RefreshCw />刷新</button></div>
        </div>
      </header>
      {error && <div role="alert" className="mx-auto mt-4 max-w-[1500px] rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          <form onSubmit={createWorkflow} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">开始新工作流</h2><button type="button" className="text-xs font-semibold text-violet-700 hover:text-violet-900" onClick={() => { setRequirement(DEMO_REQUIREMENT); setMode("baseline"); }}>填入演示需求</button></div><p className="mt-1 text-xs leading-5 text-slate-500">基线模式用于低成本验证；模型模式把六个角色接入同一条可暂停、可恢复的 Artifact 链。</p>
            <label className="mt-3 grid gap-2 text-sm font-medium">项目需求<textarea className="field min-h-32" value={requirement} onChange={(event) => setRequirement(event.target.value)} minLength={20} maxLength={20_000} required placeholder="说明项目目标、用户、核心流程、限制和验收要求。" /></label>
            <fieldset className="mt-3 grid grid-cols-2 gap-2"><legend className="mb-2 text-sm font-bold">执行模式</legend>{([['baseline','确定性基线'],['model','真实模型']] as const).map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><input type="radio" name="workflow-mode" checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}</fieldset>
            {mode === "model" && <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-bold text-violet-900">模型角色</p>{agents.length === 0 ? <p className="text-xs leading-5 text-amber-800">还没有可选 Agent，请先回到工作台创建并配置凭证。</p> : <>
              <RoleSelect label="Planner" agents={agents} value={agentConfig.plannerAgentId ?? ""} onChange={(value) => updateAgentRole("plannerAgentId", value)} />
              <RoleSelect label="候选 A（交付）" agents={agents} value={agentConfig.candidateAgentIds?.[0] ?? ""} onChange={(value) => updateCandidate(0, value)} />
              <RoleSelect label="候选 B（质量）" agents={agents} value={agentConfig.candidateAgentIds?.[1] ?? ""} onChange={(value) => updateCandidate(1, value)} />
              <RoleSelect label="Reviewer" agents={agents} value={agentConfig.reviewerAgentId ?? ""} onChange={(value) => updateAgentRole("reviewerAgentId", value)} />
              <RoleSelect label="Evaluator" agents={agents} value={agentConfig.evaluatorAgentId ?? ""} onChange={(value) => updateAgentRole("evaluatorAgentId", value)} />
              <RoleSelect label="Reporter" agents={agents} value={agentConfig.reporterAgentId ?? ""} onChange={(value) => updateAgentRole("reporterAgentId", value)} />
            </>}</div>}
            <button type="submit" disabled={submitting || requirement.trim().length < 20 || (mode === "model" && !modelReady)} className="primary-button mt-3 h-10 w-full"><Play />{submitting ? "执行中…" : "分析并执行"}</button>
          </form>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-bold">历史工作流</h2>
            {loading ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" />加载中…</p> : workflows.length === 0 ? <p className="mt-3 text-sm text-slate-500">暂无工作流。</p> : <div className="mt-3 space-y-2">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === workflow.id ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-500">{workflow.id.slice(-8)}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColor[workflow.status] ?? statusColor.pending}`}>{statusText[workflow.status] ?? workflow.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium">{workflow.requirement}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(workflow.updatedAt).toLocaleString("zh-CN")}</p></button>)}</div>}
          </section>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? <div className="grid min-h-[560px] place-items-center text-center text-slate-500"><div><GitBranch className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3">创建或选择一个工作流。</p></div></div> : <>
            <div className="border-b border-slate-200 pb-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusColor[selected.status] ?? statusColor.pending}`}>{statusText[selected.status] ?? selected.status}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{selected.mode === "model" ? "真实模型" : "确定性基线"}</span><span className="text-xs text-slate-500">当前节点：{selected.currentNode}</span></div><h2 className="mt-3 text-lg font-bold">{selected.requirement}</h2><div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400"><span>thread: {selected.threadId.slice(0, 8)}…</span><span>checkpoint: {selected.checkpoint?.id.slice(0, 8) ?? "尚未写入"}…</span><span>完整Checkpoint不会发送到浏览器</span></div>{selected.recoveryAvailable && <button type="button" disabled={submitting} onClick={() => void recoverWorkflow()} className="secondary-button mt-3 h-9 px-3"><RotateCcw />从持久化状态恢复</button>}</div>
            <ol className="mt-5 space-y-3" aria-label="工作流节点">
              {selected.nodes.map((node, index) => <li key={node.key} className="relative flex gap-4">{index < selected.nodes.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%+4px)] w-px bg-slate-200" aria-hidden="true" />}<div className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white"><StatusIcon status={node.status} /></div><article className="mb-2 min-w-0 flex-1 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">节点 {node.order + 1}</p><h3 className="font-bold">{node.key}</h3></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusColor[node.status] ?? statusColor.pending}`}>{statusText[node.status] ?? node.status}</span></div>{node.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{node.summary}</p>}{node.artifactId && <p className="mt-2 break-all text-xs text-slate-400">{node.artifactType}: {node.artifactId}</p>}{node.errorCode && <p className="mt-2 text-xs font-semibold text-red-600">{node.errorCode}</p>}</article></li>)}
            </ol>
          </>}
        </section>

        <aside className="space-y-4">
          {selected?.interrupt && <form onSubmit={resumeWorkflow} className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm" aria-labelledby="resume-title"><div className="flex items-center gap-2 text-violet-900"><PauseCircle /><h2 id="resume-title" className="font-bold">工作流已安全暂停</h2></div>{selected.interrupt.kind === "clarification" ? <><p className="mt-2 text-sm leading-6 text-violet-900">Planner需要第{selected.interrupt.round}/{selected.interrupt.maxRounds}轮补充：</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-violet-900">{selected.interrupt.questions.map((question) => <li key={question}>{question}</li>)}</ul><label className="mt-3 grid gap-2 text-sm font-medium text-violet-950">补充信息<textarea className="field min-h-28" value={answer} onChange={(event) => setAnswer(event.target.value)} required /></label></> : <><p className="mt-2 text-sm leading-6 text-violet-900">Evaluator发现有依据的高影响取舍，请明确最终方向。</p><fieldset className="mt-3 grid gap-2"><legend className="text-sm font-bold text-violet-950">裁决</legend>{([['hybrid','混合方案'],['delivery','交付优先'],['quality','质量优先'],['reject','全部拒绝']] as const).map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm"><input type="radio" name="approval" value={value} checked={approval === value} onChange={() => setApproval(value)} />{label}</label>)}</fieldset><label className="mt-3 grid gap-2 text-sm font-medium text-violet-950">裁决说明（可选）<textarea className="field min-h-24" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2_000} /></label></>}<button type="submit" disabled={submitting || (selected.interrupt.kind === "clarification" && !answer.trim())} className="primary-button mt-4 h-10 w-full"><RotateCcw />{submitting ? "恢复中…" : "从Checkpoint恢复"}</button></form>}
          {selected && <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><ShieldCheck className="text-emerald-600" /><h2 className="font-bold">Artifact链</h2></div><div className="mt-3 space-y-2 text-sm"><div className="rounded-lg bg-slate-50 p-3"><b>PlanningArtifact</b><p className="mt-1 text-xs text-slate-500">{selected.artifacts.plan ? `${selected.artifacts.plan.status} · ${selected.artifacts.plan.id}` : "尚未创建"}</p></div><div className="rounded-lg bg-slate-50 p-3"><b>ReviewWorkflow</b><p className="mt-1 text-xs text-slate-500">{selected.artifacts.review ? `${selected.artifacts.review.status} · ${selected.artifacts.review.id}` : "尚未创建"}</p></div><div className="rounded-lg bg-slate-50 p-3"><b>ReportArtifact</b>{selected.artifacts.report ? <><p className="mt-1 text-xs text-slate-500">v{selected.artifacts.report.version} · {selected.artifacts.report.status}</p><Link href="/reports" className="mt-2 inline-flex text-xs font-bold text-violet-700">查看报告 →</Link></> : <p className="mt-1 text-xs text-slate-500">尚未创建</p>}</div></div></section>}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><div className="flex items-center gap-2 font-bold text-slate-900"><HelpCircle />恢复语义</div><p className="mt-2">刷新页面不会丢失节点位置。恢复使用同一个threadId；完成节点通过幂等键回放，不重复入库或生成报告。</p></section>
        </aside>
      </div>
    </main>
  );
}
