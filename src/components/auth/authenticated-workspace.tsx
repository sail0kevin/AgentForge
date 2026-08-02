"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Code2, FileText, GitBranch, LayoutDashboard, Loader2, LogIn, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceApp } from "@/components/workspace/workspace-app";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useAgentStore } from "@/store/agent-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type SafeUser = { id: string; email: string; name: string | null };
type AuthMode = "login" | "register";

function ProductDeliveryHub({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const router = useRouter();
  const [requirement, setRequirement] = useState("");
  const [workflows, setWorkflows] = useState<Array<{ id: string; status: string; requirement: string; updatedAt: string }>>([]);
  const [reportGroups, setReportGroups] = useState<Array<{ id: string; groupId: string; requirement: string; status: string; reports: Array<unknown>; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRecent() {
      setLoading(true);
      try {
        const [workflowResponse, reportResponse] = await Promise.all([
          fetch("/api/workflows", { cache: "no-store" }),
          fetch("/api/reports/product-ui", { cache: "no-store" }),
        ]);
        const workflowData = await workflowResponse.json().catch(() => null) as { workflows?: Array<{ id: string; status: string; requirement: string; updatedAt: string }> } | null;
        const reportData = await reportResponse.json().catch(() => null) as { groups?: Array<{ id: string; groupId: string; requirement: string; status: string; reports: Array<unknown>; createdAt: string }> } | null;
        if (!workflowResponse.ok || !reportResponse.ok) throw new Error("交付记录加载失败，请稍后重试。");
        if (!active) return;
        setWorkflows(workflowData?.workflows ?? []);
        setReportGroups(reportData?.groups ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "交付记录加载失败。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadRecent();
    return () => { active = false; };
  }, []);

  async function createDeliveryWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedRequirement = requirement.trim();
    if (trimmedRequirement.length < 20) {
      setError("请至少描述 20 个字符的产品或网站需求。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: trimmedRequirement, mode: "baseline", agents: {} }),
      });
      const data = await response.json().catch(() => null) as { workflow?: { id: string }; error?: { message?: string } } | null;
      if (!response.ok || !data?.workflow) throw new Error(data?.error?.message || "工作流创建失败。");
      router.push(`/workflows?workflowId=${encodeURIComponent(data.workflow.id)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "工作流创建失败。");
    } finally {
      setSubmitting(false);
    }
  }

  const workflowStatus = (status: string) => ({
    pending: "等待处理",
    running: "分析中",
    needs_clarification: "等待补充",
    needs_human: "等待确认",
    completed: "已完成",
    partial: "部分完成",
    blocked: "已阻塞",
    failed: "失败",
  }[status] ?? status);

  return (
    <main className="auth-page min-h-screen px-5 pb-12 pt-24 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="auth-kicker text-sm font-bold uppercase tracking-[0.18em]">AgentForge / Delivery Hub</p>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">创建产品/UI实施报告</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">提交一个产品或网站需求，AgentForge 会整理出多套可交给下游 AI 编程 Agent 的完整实施报告。</p>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]" aria-label="创建交付任务">
          <form onSubmit={createDeliveryWorkflow} className="accent-card rounded-lg border p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">从需求开始</h2>
                <p className="mt-1 text-sm text-slate-600">描述目标用户、核心流程、页面范围和你希望看到的结果。</p>
              </div>
              <Plus className="hidden h-5 w-5 text-indigo-600 sm:block" />
            </div>
            <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800" htmlFor="delivery-requirement">产品或网站需求
              <textarea id="delivery-requirement" value={requirement} onChange={(event) => setRequirement(event.target.value)} className="field min-h-40 resize-y bg-white text-sm leading-6" placeholder="例如：为独立开发者做一个项目展示与联系网站，包含首页、项目详情、案例筛选、联系表单和移动端适配。" maxLength={20_000} required />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>至少 20 个字符</span><span>{requirement.length.toLocaleString()} / 20,000</span></div>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={submitting} className="primary-button h-10 px-4">{submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}{submitting ? "正在创建" : "开始需求分析"}</button>
              <Link href="/workflows" className="secondary-button h-10 px-4">高级配置</Link>
              <span className="text-xs text-slate-500">当前使用确定性基线，不调用外部模型。</span>
            </div>
          </form>

          <aside className="secondary-card rounded-lg border p-5 sm:p-6">
            <h2 className="text-lg font-bold">交付链路</h2>
            <ol className="mt-5 space-y-4 text-sm text-slate-700">
              {["澄清需求与边界", "生成三套产品/UI实施报告", "导出 Prompt 或 JSON handoff", "回写运行、截图和测试证据"].map((item, index) => <li key={item} className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{index + 1}</span><span className="pt-0.5">{item}</span></li>)}
            </ol>
            <p className="mt-6 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">首页负责发起交付任务；Agent 配置、知识库和手动对话调试仍保留在支撑工作台。</p>
            <button type="button" onClick={onOpenWorkspace} className="secondary-button mt-4 h-9 w-full px-3">进入 Agent 配置与调试<ArrowRight className="h-4 w-4" /></button>
          </aside>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2" aria-label="最近交付记录">
          <div>
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">最近需求</h2><Link href="/workflows" className="text-sm font-semibold text-indigo-700">查看全部</Link></div>
            {loading ? <p className="mt-4 text-sm text-slate-500">加载中…</p> : workflows.length === 0 ? <p className="mt-4 text-sm text-slate-500">还没有需求工作流。</p> : <div className="mt-3 space-y-2">{workflows.slice(0, 5).map((workflow) => <Link key={workflow.id} href={`/workflows?workflowId=${encodeURIComponent(workflow.id)}`} className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{workflow.id.slice(-8)}</span><span className="text-xs font-semibold text-indigo-700">{workflowStatus(workflow.status)}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium">{workflow.requirement}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(workflow.updatedAt).toLocaleString("zh-CN")}</p></Link>)}</div>}
          </div>
          <div>
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">最近产品/UI报告</h2><Link href="/reports" className="text-sm font-semibold text-indigo-700">查看全部</Link></div>
            {loading ? <p className="mt-4 text-sm text-slate-500">加载中…</p> : reportGroups.length === 0 ? <p className="mt-4 text-sm text-slate-500">还没有产品/UI报告。</p> : <div className="mt-3 space-y-2">{reportGroups.slice(0, 5).map((group) => <Link key={group.id} href={`/reports?groupId=${encodeURIComponent(group.id)}`} className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{group.reports.length} 套方案</span><span className="text-xs font-semibold text-emerald-700">{group.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium">{group.requirement}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(group.createdAt).toLocaleString("zh-CN")}</p></Link>)}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
const initialWorkspace: WorkspaceSnapshot = {
  id: "local",
  name: "AgentForge Agent 配置与调试",
  description: "用于配置 Agent、知识库和手动调试的本地支撑工作台",
  mode: "sequential",
  budgetLimit: 999999,
  agents: [],
  messages: [],
  totalSpent: 0,
  status: "idle",
};
const workspaceThemeStorageKey = "multi-agent-workspace.theme.v1";

function subscribeToWorkspaceTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === workspaceThemeStorageKey) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function getWorkspaceTheme() {
  return window.localStorage.getItem(workspaceThemeStorageKey) === "dark" ? "dark" : "light";
}

function getServerWorkspaceTheme() {
  return "light";
}

/**
 * 认证壳把登录状态与工作台分开，避免把账号逻辑继续塞进大型 WorkspaceApp。
 * local 模式下 /api/auth/me 会返回本机用户；session 模式下未登录则显示表单。
 */
export function AuthenticatedWorkspace() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const deliveryTheme = useSyncExternalStore(
    subscribeToWorkspaceTheme,
    getWorkspaceTheme,
    getServerWorkspaceTheme,
  );

  async function fetchCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { user?: SafeUser };
      setUser(data.user ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCurrentUser();
  }, []);


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { email, password, name } : { email, password }),
      });
      const data = await response.json().catch(() => null) as { user?: SafeUser; error?: { message?: string } | string } | null;
      if (!response.ok || !data?.user) {
        const message = typeof data?.error === "string" ? data.error : data?.error?.message;
        throw new Error(message || "Authentication failed.");
      }
      // 登录成功后只保存安全的公开用户资料，JWT 始终留在 HttpOnly Cookie 中。
      setUser(data.user);
      setPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "DELETE" }).catch(() => undefined);
    useWorkspaceStore.getState().clearSession();
    useAgentStore.getState().clearSession();
    setUser(null);
    setPassword("");
  }

  if (loading) {
    return <main className="auth-page grid min-h-screen place-items-center text-slate-600">正在验证登录状态…</main>;
  }

  if (!user) {
    const isRegister = mode === "register";
    return (
      <main className="auth-page grid min-h-screen place-items-center p-6 text-slate-900">
        <form onSubmit={submit} className="auth-card w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div>
            <p className="auth-kicker text-sm font-bold uppercase tracking-[0.18em] text-[#5B5BD6]">AgentForge</p>
            <h1 className="mt-2 text-2xl font-bold">{isRegister ? "创建账号" : "登录 AgentForge"}</h1>
            <p className="mt-2 text-sm text-slate-500">{isRegister ? "注册后会自动登录，并使用独立的数据和凭证。" : "请登录后管理你的需求工作流、产品/UI报告和证据。"}</p>
          </div>
          {isRegister && <label className="block text-sm font-medium">昵称<input value={name} onChange={(event) => setName(event.target.value)} className="field mt-1" autoComplete="name" /></label>}
          <label className="block text-sm font-medium">邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} className="field mt-1" type="email" autoComplete="email" required /></label>
          <label className="block text-sm font-medium">密码<input value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-1" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} required /></label>
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" className="primary-button h-10 w-full" disabled={submitting}>{isRegister ? <UserPlus /> : <LogIn />}{submitting ? "请稍候…" : isRegister ? "注册并登录" : "登录"}</button>
          <button type="button" className="w-full text-sm font-medium text-[#5B5BD6]" onClick={() => { setMode(isRegister ? "login" : "register"); setError(null); }}>
            {isRegister ? "已有账号？去登录" : "没有账号？创建账号"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div data-theme={deliveryTheme} className={deliveryTheme === "dark" ? "theme-dark" : undefined}>
      <div className="global-account-bar fixed right-4 top-3 z-50 flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
        <Link href="/" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><LayoutDashboard className="h-3.5 w-3.5" />交付台</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <Link href="/workflows" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><GitBranch className="h-3.5 w-3.5" />工作流</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <Link href="/scenarios" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><Code2 className="h-3.5 w-3.5" />工程辅助</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <Link href="/reports" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><FileText className="h-3.5 w-3.5" />报告中心</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <span>{user.name || user.email}</span>
        <button type="button" onClick={logout} className="font-semibold text-[#5B5BD6]">退出登录</button>
      </div>
      {showWorkspace ? <WorkspaceApp initialWorkspace={initialWorkspace} /> : <ProductDeliveryHub onOpenWorkspace={() => setShowWorkspace(true)} />}
    </div>
  );
}
