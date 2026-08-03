"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, FileText, GitBranch, HelpCircle, Loader2, PauseCircle, Play, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";

type WorkflowNode = {
  key: string; order: number; status: string; attempt: number; artifactType: string | null; artifactId: string | null;
  summary: string | null; errorCode: string | null; startedAt: string | null; finishedAt: string | null;
};
type PlanTask = {
  id: string; title: string; description: string; agentRole: string;
  dependsOn: string[]; toolIds: string[]; estimatedTokens: number;
};
type TaskDraft = Omit<PlanTask, "id">;
type InterruptPayload =
  | { kind: "clarification"; questions: string[]; round: number; maxRounds: number }
  | { kind: "approval"; reviewWorkflowId: string; decisions: string[] };
type WorkflowRecord = {
  id: string; threadId: string; status: string; currentNode: string; requirement: string; mode: string; nodes: WorkflowNode[];
  agents: WorkflowAgentConfig;
  interrupt: InterruptPayload | null; checkpoint: { id: string; namespace: string } | null; lastErrorCode: string | null;
  leaseExpiresAt: string | null; recoveryAvailable: boolean;
  artifacts: {
    plan: { id: string; status: string; tasks: PlanTask[] | null; createdAt: string } | null;
    review: {
      id: string; status: string; approvalStatus: string; approvalDecision: string | null; createdAt: string;
      intervention: { kind: "policy_decision_support"; score: number; level: "high" | "medium" | "low"; intervention: "not_required" | "recommended" | "required"; hardHumanGate: boolean; reasons: string[] } | null;
    } | null;
    report: { id: string; status: string; version: number; title: string; createdAt: string } | null;
    productUI: { id: string; groupId: string; status: string; schemaVersion: number; createdAt: string; updatedAt: string } | null;
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
type PilotReportUsability = "usable_without_edits" | "usable_with_edits" | "not_usable";
type PilotInterventionReason = "not_needed" | "missing_context" | "tradeoff_confirmation" | "risk_confirmation" | "other";
type PilotEvidenceIssueType = "none" | "missing_evidence" | "irrelevant_evidence" | "incorrect_evidence" | "outdated_evidence" | "other";
type PilotFailureCategory = "none" | "requirement_understanding" | "plan_quality" | "review_quality" | "report_quality" | "workflow_reliability" | "provider_failure" | "other";
type PilotFeedback = {
  id: string; workflowId: string; reportUsability: PilotReportUsability; humanEdited: boolean;
  interventionReason: PilotInterventionReason | null; evidenceIssueType: PilotEvidenceIssueType | null;
  failureCategory: PilotFailureCategory | null; note: string | null; createdAt: string; updatedAt: string;
};
type PilotFeedbackDraft = {
  reportUsability: PilotReportUsability; humanEdited: boolean; interventionReason: PilotInterventionReason;
  evidenceIssueType: PilotEvidenceIssueType; failureCategory: PilotFailureCategory; note: string;
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
const TASK_ROLES = ["requirements", "architecture", "frontend", "backend", "data", "testing", "security", "reporter"];
const TERMINAL_WORKFLOW_STATUSES = new Set(["completed", "partial", "blocked", "inconclusive", "failed"]);
const EMPTY_PILOT_FEEDBACK: PilotFeedbackDraft = {
  reportUsability: "usable_without_edits", humanEdited: false, interventionReason: "not_needed",
  evidenceIssueType: "none", failureCategory: "none", note: "",
};

function taskDraft(task: PlanTask): TaskDraft {
  return { title: task.title, description: task.description, agentRole: task.agentRole, dependsOn: task.dependsOn, toolIds: task.toolIds, estimatedTokens: task.estimatedTokens };
}

function sameTaskDraft(left: TaskDraft, right: TaskDraft) {
  return left.title === right.title && left.description === right.description && left.agentRole === right.agentRole
    && left.estimatedTokens === right.estimatedTokens && left.dependsOn.join("\u0000") === right.dependsOn.join("\u0000")
    && left.toolIds.join("\u0000") === right.toolIds.join("\u0000");
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function taskDraftKey(workflowId: string | undefined, taskId: string) {
  return `${workflowId ?? "unselected"}:${taskId}`;
}

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
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [pilotFeedback, setPilotFeedback] = useState<PilotFeedback | null>(null);
  const [pilotFeedbackDraft, setPilotFeedbackDraft] = useState<PilotFeedbackDraft>(EMPTY_PILOT_FEEDBACK);
  const [pilotFeedbackLoading, setPilotFeedbackLoading] = useState(false);
  const [pilotFeedbackSubmitting, setPilotFeedbackSubmitting] = useState(false);
  const [pilotFeedbackMessage, setPilotFeedbackMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
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
      // 首页创建后通过 query 参数深链接到刚刚发起的工作流。
      const requestedWorkflowId = new URLSearchParams(window.location.search).get("workflowId");
      setSelectedId((current) => requestedWorkflowId && data.workflows!.some((item) => item.id === requestedWorkflowId)
        ? requestedWorkflowId
        : current && data.workflows!.some((item) => item.id === current)
          ? current
          : data.workflows![0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "工作流加载失败。 ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(() => workflows.find((item) => item.id === selectedId) ?? null, [selectedId, workflows]);
  const selectedIsTerminal = Boolean(selected && TERMINAL_WORKFLOW_STATUSES.has(selected.status));
  const modelReady = Boolean(
    agentConfig.plannerAgentId && agentConfig.candidateAgentIds?.[0] && agentConfig.candidateAgentIds[1]
    && agentConfig.reviewerAgentId && agentConfig.evaluatorAgentId && agentConfig.reporterAgentId,
  );

  useEffect(() => {
    const workflowId = selected?.id;
    if (!workflowId || !selectedIsTerminal) return;
    let cancelled = false;
    const loadFeedback = async () => {
      setPilotFeedbackLoading(true);
      setPilotFeedbackMessage(null);
      try {
        const response = await fetch(`/api/workflows/${workflowId}/feedback`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { feedback?: PilotFeedback | null; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(data?.error?.message || "试点反馈加载失败。 ");
        if (cancelled) return;
        const feedback = data?.feedback ?? null;
        setPilotFeedback(feedback);
        setPilotFeedbackDraft(feedback ? {
          reportUsability: feedback.reportUsability,
          humanEdited: feedback.humanEdited,
          interventionReason: feedback.interventionReason ?? "not_needed",
          evidenceIssueType: feedback.evidenceIssueType ?? "none",
          failureCategory: feedback.failureCategory ?? "none",
          note: feedback.note ?? "",
        } : EMPTY_PILOT_FEEDBACK);
      } catch (feedbackError) {
        if (!cancelled) setPilotFeedbackMessage({
          kind: "error",
          text: feedbackError instanceof Error ? feedbackError.message : "试点反馈加载失败。 ",
        });
      } finally {
        if (!cancelled) setPilotFeedbackLoading(false);
      }
    };
    void loadFeedback();
    return () => { cancelled = true; };
  }, [selected?.id, selectedIsTerminal]);

  function updateTaskDraft(taskId: string, update: Partial<TaskDraft>) {
    const source = selected?.artifacts.plan?.tasks?.find((task) => task.id === taskId);
    if (!source) return;
    // 草稿只保存用户改过的字段；未修改任务始终以服务端返回的原计划为准。
    const key = taskDraftKey(selected?.id, taskId);
    setTaskDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? taskDraft(source)), ...update } }));
  }

  function approvalTaskPatch() {
    const tasks = selected?.artifacts.plan?.tasks ?? [];
    const taskEdits = tasks.flatMap((task) => {
      const draft = taskDrafts[taskDraftKey(selected?.id, task.id)] ?? taskDraft(task);
      if (sameTaskDraft(taskDraft(task), draft)) return [];
      return [{ taskId: task.id, ...draft }];
    });
    return taskEdits.length > 0 ? { schemaVersion: 1 as const, taskEdits } : undefined;
  }

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
      : {
        kind: "approval", decision: approval, ...(note.trim() ? { note: note.trim() } : {}),
        ...(approval === "reject" ? {} : { ...(approvalTaskPatch() ? { taskPatch: approvalTaskPatch() } : {}) }),
      };
    try {
      const response = await fetch(`/api/workflows/${selected.id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => null) as { workflow?: WorkflowRecord; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflow) throw new Error(data?.error?.message || "Checkpoint恢复失败。 ");
      setAnswer(""); setNote(""); setTaskDrafts({});
      await load();
      setSelectedId(data.workflow.id);
    } catch (resumeError) { setError(resumeError instanceof Error ? resumeError.message : "Checkpoint恢复失败。 "); }
    finally { setSubmitting(false); }
  }

  async function savePilotFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selectedIsTerminal) return;
    setPilotFeedbackSubmitting(true);
    setPilotFeedbackMessage(null);
    try {
      const response = await fetch(`/api/workflows/${selected.id}/feedback`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          ...pilotFeedbackDraft,
          interventionReason: pilotFeedbackDraft.humanEdited ? pilotFeedbackDraft.interventionReason : "not_needed",
        }),
      });
      const data = await response.json().catch(() => null) as { feedback?: PilotFeedback; error?: { message?: string } } | null;
      if (!response.ok || !data?.feedback) throw new Error(data?.error?.message || "试点反馈保存失败。 ");
      setPilotFeedback(data.feedback);
      setPilotFeedbackMessage({ kind: "success", text: "反馈已保存，可在复盘后再次修改。" });
    } catch (feedbackError) {
      setPilotFeedbackMessage({
        kind: "error",
        text: feedbackError instanceof Error ? feedbackError.message : "试点反馈保存失败。 ",
      });
    } finally { setPilotFeedbackSubmitting(false); }
  }

  return (
    <main className="secondary-page min-h-screen text-slate-900">
      <header className="secondary-header border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4"><Link href="/" className="icon-button" aria-label="返回工作台"><ArrowLeft /></Link><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">AgentForge</p><h1 className="text-xl font-bold">产品/UI报告工作流</h1><p className="mt-1 text-xs text-slate-500">需求澄清 → 候选方案 → 交叉评审 → 人工确认 → 三套实施报告</p></div></div>
          <div className="flex gap-2"><Link href="/reports" className="secondary-button h-9 px-3"><FileText />报告中心</Link><button type="button" className="secondary-button h-9 px-3" onClick={() => void load()}><RefreshCw />刷新</button></div>
        </div>
      </header>
      {error && <div role="alert" className="mx-auto mt-4 max-w-[1500px] rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mx-auto grid max-w-[1500px] gap-5 p-5 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          <form onSubmit={createWorkflow} className="secondary-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">生成三套产品/UI报告</h2><button type="button" className="text-xs font-semibold text-violet-700 hover:text-violet-900" onClick={() => { setRequirement(DEMO_REQUIREMENT); setMode("baseline"); }}>填入演示需求</button></div><p className="mt-1 text-xs leading-5 text-slate-500">基线模式用于低成本验证；模型模式把多个角色接入同一条可暂停、可恢复的工作流，最终交付体验优先、视觉优先、工程优先三套实施报告。</p>
            <label className="mt-3 grid gap-2 text-sm font-medium">项目需求<textarea className="field min-h-32" value={requirement} onChange={(event) => setRequirement(event.target.value)} minLength={20} maxLength={20_000} required placeholder="说明项目目标、用户、核心流程、限制和验收要求。" /></label>
            <fieldset className="mt-3 grid grid-cols-2 gap-2"><legend className="mb-2 text-sm font-bold">执行模式</legend>{([['baseline','确定性基线'],['model','真实模型']] as const).map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><input type="radio" name="workflow-mode" checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}</fieldset>
            {mode === "model" && <div className="mt-3 space-y-2 accent-card rounded-xl border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-bold text-violet-900">模型角色</p>{agents.length === 0 ? <p className="text-xs leading-5 text-amber-800">还没有可选 Agent，请先回到工作台创建并配置凭证。</p> : <>
              <RoleSelect label="Planner" agents={agents} value={agentConfig.plannerAgentId ?? ""} onChange={(value) => updateAgentRole("plannerAgentId", value)} />
              <RoleSelect label="候选 A（交付）" agents={agents} value={agentConfig.candidateAgentIds?.[0] ?? ""} onChange={(value) => updateCandidate(0, value)} />
              <RoleSelect label="候选 B（质量）" agents={agents} value={agentConfig.candidateAgentIds?.[1] ?? ""} onChange={(value) => updateCandidate(1, value)} />
              <RoleSelect label="Reviewer" agents={agents} value={agentConfig.reviewerAgentId ?? ""} onChange={(value) => updateAgentRole("reviewerAgentId", value)} />
              <RoleSelect label="Evaluator" agents={agents} value={agentConfig.evaluatorAgentId ?? ""} onChange={(value) => updateAgentRole("evaluatorAgentId", value)} />
              <RoleSelect label="Reporter" agents={agents} value={agentConfig.reporterAgentId ?? ""} onChange={(value) => updateAgentRole("reporterAgentId", value)} />
            </>}</div>}
            <button type="submit" disabled={submitting || requirement.trim().length < 20 || (mode === "model" && !modelReady)} className="primary-button mt-3 h-10 w-full"><Play />{submitting ? "执行中…" : "分析并执行"}</button>
          </form>
          <section className="secondary-card rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-bold">历史工作流</h2>
            {loading ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" />加载中…</p> : workflows.length === 0 ? <p className="mt-3 text-sm text-slate-500">暂无工作流。</p> : <div className="mt-3 space-y-2">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedId(workflow.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === workflow.id ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-500">{workflow.id.slice(-8)}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColor[workflow.status] ?? statusColor.pending}`}>{statusText[workflow.status] ?? workflow.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium">{workflow.requirement}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(workflow.updatedAt).toLocaleString("zh-CN")}</p></button>)}</div>}
          </section>
        </aside>

        <section className="min-w-0 secondary-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? <div className="grid min-h-[560px] place-items-center text-center text-slate-500"><div><GitBranch className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3">创建或选择一个工作流。</p></div></div> : <>
             <div className="border-b border-slate-200 pb-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusColor[selected.status] ?? statusColor.pending}`}>{statusText[selected.status] ?? selected.status}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{selected.mode === "model" ? "真实模型" : "确定性基线"}</span><span className="text-xs text-slate-500">当前节点：{selected.currentNode}</span></div><h2 className="mt-3 text-lg font-bold">{selected.requirement}</h2><div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400"><span>thread: {selected.threadId.slice(0, 8)}…</span><span>checkpoint: {selected.checkpoint?.id.slice(0, 8) ?? "尚未写入"}…</span><span>完整Checkpoint不会发送到浏览器</span></div>{selected.recoveryAvailable && <button type="button" disabled={submitting} onClick={() => void recoverWorkflow()} className="secondary-button mt-3 h-9 px-3"><RotateCcw />从持久化状态恢复</button>}</div>
             {selected.status === "running" && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-bold">正在生成交付报告</p><p className="mt-1 text-xs leading-5">系统正在完成需求分析、双候选评审和报告编排。流程结束后会在右侧出现三套产品/UI实施报告。</p></div>}
             {selected.status === "needs_clarification" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">需要补充需求信息</p><p className="mt-1 text-xs leading-5">请在右侧回答 Planner 的问题，系统会从当前 Checkpoint 继续，不会重新生成已完成节点。</p></div>}
             {selected.status === "needs_human" && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"><p className="font-bold">需要人工确认方案取舍</p><p className="mt-1 text-xs leading-5">请在右侧选择混合、交付优先、质量优先或拒绝，必要时可直接修改任务后继续。</p></div>}
             {selected.artifacts.productUI ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><p className="font-bold text-emerald-900">三套产品/UI实施报告已生成</p><p className="mt-1 text-xs leading-5 text-emerald-800">报告可以直接交给下游 AI 编程 Agent，网站是否已经生成仍需以后续运行地址、截图和验收记录为准。</p></div><Link href={`/reports?groupId=${encodeURIComponent(selected.artifacts.productUI.id)}`} className="primary-button h-10 shrink-0 px-4"><FileText />查看三套报告</Link></div> : selectedIsTerminal && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">当前流程已结束，但还没有产品/UI报告</p><p className="mt-1 text-xs leading-5">请检查评审或报告节点的状态与错误信息；只有评审可报告且输入完整时，系统才会生成最终交付物。</p></div>}
             <ol className="mt-5 space-y-3" aria-label="工作流节点">
              {selected.nodes.map((node, index) => <li key={node.key} className="relative flex gap-4">{index < selected.nodes.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%+4px)] w-px bg-slate-200" aria-hidden="true" />}<div className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white"><StatusIcon status={node.status} /></div><article className="mb-2 min-w-0 flex-1 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">节点 {node.order + 1}</p><h3 className="font-bold">{node.key}</h3></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusColor[node.status] ?? statusColor.pending}`}>{statusText[node.status] ?? node.status}</span></div>{node.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{node.summary}</p>}{node.artifactId && <p className="mt-2 break-all text-xs text-slate-400">{node.artifactType}: {node.artifactId}</p>}{node.errorCode && <p className="mt-2 text-xs font-semibold text-red-600">{node.errorCode}</p>}</article></li>)}
            </ol>
          </>}
        </section>

        <aside className="space-y-4">
          {selected?.interrupt && <form onSubmit={resumeWorkflow} className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm" aria-labelledby="resume-title"><div className="flex items-center gap-2 text-violet-900"><PauseCircle /><h2 id="resume-title" className="font-bold">工作流已安全暂停</h2></div>{selected.interrupt.kind === "clarification" ? <><p className="mt-2 text-sm leading-6 text-violet-900">Planner需要第{selected.interrupt.round}/{selected.interrupt.maxRounds}轮补充：</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-violet-900">{selected.interrupt.questions.map((question) => <li key={question}>{question}</li>)}</ul><label className="mt-3 grid gap-2 text-sm font-medium text-violet-950">补充信息<textarea className="field min-h-28" value={answer} onChange={(event) => setAnswer(event.target.value)} required /></label></> : <><p className="mt-2 text-sm leading-6 text-violet-900">{selected.artifacts.review?.intervention?.hardHumanGate ? "已发现有依据的高影响取舍，必须由人工明确最终方向。" : "策略信号显示当前自动裁决把握不足，建议人工确认最终方向。"}</p>{selected.artifacts.review?.intervention && <section className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-xs text-violet-950"><div className="flex items-center justify-between gap-2"><h3 className="font-bold">决策支持信号</h3><span>等级：{selected.artifacts.review.intervention.level} · 分数：{selected.artifacts.review.intervention.score}</span></div><ul className="mt-2 list-disc space-y-1 pl-4 leading-5">{selected.artifacts.review.intervention.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-2 text-slate-500">该信号由证据与规则计算，不代表模型语义正确率。</p></section>}<fieldset className="mt-3 grid gap-2"><legend className="text-sm font-bold text-violet-950">裁决</legend>{([['hybrid','混合方案'],['delivery','交付优先'],['quality','质量优先'],['reject','全部拒绝']] as const).map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm"><input type="radio" name="approval" value={value} checked={approval === value} onChange={() => setApproval(value)} />{label}</label>)}</fieldset>{approval !== "reject" && (selected.artifacts.plan?.tasks?.length ?? 0) > 0 && <section className="mt-3 border-t border-violet-200 pt-3"><h3 className="text-sm font-bold text-violet-950">任务修改</h3><div className="mt-2 space-y-3">{selected.artifacts.plan?.tasks?.map((task) => { const draft = taskDrafts[taskDraftKey(selected.id, task.id)] ?? taskDraft(task); return <fieldset key={task.id} className="space-y-2 rounded-lg border border-violet-200 bg-white p-3"><legend className="px-1 text-xs font-bold text-violet-900">{task.id}</legend><label className="grid gap-1 text-xs font-semibold text-slate-700">标题<input className="field h-8 text-xs" value={draft.title} onChange={(event) => updateTaskDraft(task.id, { title: event.target.value })} maxLength={160} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">描述<textarea className="field min-h-20 text-xs" value={draft.description} onChange={(event) => updateTaskDraft(task.id, { description: event.target.value })} maxLength={1_000} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">角色<select className="field h-8 bg-white text-xs" value={draft.agentRole} onChange={(event) => updateTaskDraft(task.id, { agentRole: event.target.value })}>{TASK_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-700">预估 Token<input className="field h-8 text-xs" type="number" min={1} max={100_000} value={draft.estimatedTokens} onChange={(event) => updateTaskDraft(task.id, { estimatedTokens: Number(event.target.value) || 0 })} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">依赖任务<input className="field h-8 text-xs" value={draft.dependsOn.join(", ")} onChange={(event) => updateTaskDraft(task.id, { dependsOn: parseList(event.target.value) })} /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">工具<input className="field h-8 text-xs" value={draft.toolIds.join(", ")} onChange={(event) => updateTaskDraft(task.id, { toolIds: parseList(event.target.value) })} /></label></fieldset>; })}</div></section>}<label className="mt-3 grid gap-2 text-sm font-medium text-violet-950">裁决说明（可选）<textarea className="field min-h-24" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2_000} /></label></>}<button type="submit" disabled={submitting || (selected.interrupt.kind === "clarification" && !answer.trim())} className="primary-button mt-4 h-10 w-full"><RotateCcw />{submitting ? "恢复中…" : "从Checkpoint恢复"}</button></form>}
          {selectedIsTerminal && <form onSubmit={savePilotFeedback} className="secondary-card rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="pilot-feedback-title">
            <div className="flex items-center gap-2"><CheckCircle2 className="text-emerald-600" /><h2 id="pilot-feedback-title" className="font-bold">试点反馈</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">仅记录报告可用性和改进线索，不保存 Prompt、原始输出或凭证。</p>
            {pilotFeedbackLoading ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" />加载反馈…</p> : <>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">报告可用性<select className="field h-9 bg-white text-xs" value={pilotFeedbackDraft.reportUsability} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, reportUsability: event.target.value as PilotReportUsability }))}><option value="usable_without_edits">无需修改即可使用</option><option value="usable_with_edits">修改后可用</option><option value="not_usable">当前不可用</option></select></label>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={pilotFeedbackDraft.humanEdited} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, humanEdited: event.target.checked }))} />人工修改了报告或计划</label>
              {pilotFeedbackDraft.humanEdited && <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">人工干预原因<select className="field h-9 bg-white text-xs" value={pilotFeedbackDraft.interventionReason} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, interventionReason: event.target.value as PilotInterventionReason }))}><option value="not_needed">未说明</option><option value="missing_context">缺少上下文</option><option value="tradeoff_confirmation">需要确认取舍</option><option value="risk_confirmation">需要确认风险</option><option value="other">其他</option></select></label>}
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">证据问题<select className="field h-9 bg-white text-xs" value={pilotFeedbackDraft.evidenceIssueType} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, evidenceIssueType: event.target.value as PilotEvidenceIssueType }))}><option value="none">无</option><option value="missing_evidence">缺少证据</option><option value="irrelevant_evidence">证据不相关</option><option value="incorrect_evidence">证据错误</option><option value="outdated_evidence">证据过期</option><option value="other">其他</option></select></label>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">主要失败分类<select className="field h-9 bg-white text-xs" value={pilotFeedbackDraft.failureCategory} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, failureCategory: event.target.value as PilotFailureCategory }))}><option value="none">无</option><option value="requirement_understanding">需求理解</option><option value="plan_quality">计划质量</option><option value="review_quality">评审质量</option><option value="report_quality">报告质量</option><option value="workflow_reliability">工作流可靠性</option><option value="provider_failure">模型服务</option><option value="other">其他</option></select></label>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">备注（可选）<textarea className="field min-h-20 text-xs" value={pilotFeedbackDraft.note} onChange={(event) => setPilotFeedbackDraft((current) => ({ ...current, note: event.target.value }))} maxLength={2_000} /></label>
               {pilotFeedbackMessage && <p className={`mt-3 text-xs ${pilotFeedbackMessage.kind === "success" ? "text-emerald-700" : "text-red-700"}`}>{pilotFeedbackMessage.text}</p>}
              <button type="submit" disabled={pilotFeedbackSubmitting} className="secondary-button mt-3 h-9 w-full justify-center px-3"><CheckCircle2 />{pilotFeedbackSubmitting ? "保存中…" : pilotFeedback ? "更新反馈" : "保存反馈"}</button>
            </>}
          </form>}
          {selected && <section className="secondary-card rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><ShieldCheck className="text-emerald-600" /><h2 className="font-bold">交付链路</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">下方是内部过程产物与最终交付物的关系。普通用户优先关注三套产品/UI报告；内部 Artifact 用于追踪、恢复和审计。</p><div className="mt-3 space-y-2 text-sm"><div className="soft-card rounded-lg border border-violet-200 bg-violet-50 p-3"><b>产品/UI报告组（主交付物）</b>{selected.artifacts.productUI ? <><p className="mt-1 text-xs text-violet-800">{selected.artifacts.productUI.status} · {selected.artifacts.productUI.groupId}</p><p className="mt-1 text-[11px] leading-5 text-violet-700">已生成体验优先、视觉优先、工程优先三套可交给下游 AI 编程 Agent 的完整实施报告。</p><Link href={`/reports?groupId=${encodeURIComponent(selected.artifacts.productUI.id)}`} className="mt-2 inline-flex text-xs font-bold text-violet-700">查看本组报告 →</Link></> : <p className="mt-1 text-xs text-slate-500">尚未创建</p>}</div><div className="soft-card rounded-lg bg-slate-50 p-3"><b>需求规划产物</b><p className="mt-1 text-xs text-slate-500">{selected.artifacts.plan ? `${selected.artifacts.plan.status} · ${selected.artifacts.plan.id}` : "尚未创建"}</p></div><div className="soft-card rounded-lg bg-slate-50 p-3"><b>交叉评审工作流</b><p className="mt-1 text-xs text-slate-500">{selected.artifacts.review ? `${selected.artifacts.review.status} · ${selected.artifacts.review.id}` : "尚未创建"}</p></div><div className="soft-card rounded-lg bg-slate-50 p-3"><b>历史 ReportArtifact（兼容）</b>{selected.artifacts.report ? <p className="mt-1 text-xs text-slate-500">v{selected.artifacts.report.version} · {selected.artifacts.report.status}</p> : <p className="mt-1 text-xs text-slate-500">尚未创建</p>}</div></div></section>}
          <section className="secondary-card rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><div className="flex items-center gap-2 font-bold text-slate-900"><HelpCircle />恢复语义</div><p className="mt-2">刷新页面不会丢失节点位置。恢复使用同一个threadId；完成节点通过幂等键回放，不重复入库或生成报告。</p></section>
        </aside>
      </div>
    </main>
  );
}
