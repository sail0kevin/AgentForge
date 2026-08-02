"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Bot, CheckCircle2, Code2, FileJson, FileText, GitBranch, LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { WorkspaceApp } from "@/components/workspace/workspace-app";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useAgentStore } from "@/store/agent-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type SafeUser = { id: string; email: string; name: string | null };
type AuthMode = "login" | "register";

function ProductDeliveryHub({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const steps = [
    {
      icon: GitBranch,
      title: "需求工作流",
      description: "提交产品或网站需求，完成信息补充、多 Agent 规划、交叉评审和人工裁决。",
      action: "开始需求分析",
      href: "/workflows",
    },
    {
      icon: FileText,
      title: "三套产品/UI报告",
      description: "得到体验优先、视觉优先、工程优先三套可以比较、导出和复核的实施规格。",
      action: "查看交付报告",
      href: "/reports",
    },
    {
      icon: FileJson,
      title: "交给下游 AI",
      description: "复制编程 Prompt 或导出 JSON handoff，让下游 AI 编程 Agent 生成真实网站，再回写验收证据。",
      action: "准备下游交接",
      href: "/reports",
    },
  ] as const;

  return (
    <main className="auth-page min-h-screen px-5 pb-12 pt-24 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="auth-kicker text-sm font-bold uppercase tracking-[0.18em]">AgentForge / Delivery Hub</p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">从产品需求，到三套可交付的网站实施报告</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            AgentForge 把零散需求整理成结构化产品/UI实施报告。每套报告包含页面、流程、组件、状态、验收标准、来源证据和交付边界，可直接交给下游 AI 编程 Agent。
          </p>
        </header>

        <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label="产品交付流程">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className="secondary-card relative rounded-2xl border p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-[#5965F2]"><Icon className="h-5 w-5" /></span>
                  <span className="text-xs font-bold tracking-[0.18em] text-slate-400">0{index + 1}</span>
                </div>
                <h2 className="mt-6 text-xl font-bold">{step.title}</h2>
                <p className="mt-3 min-h-14 text-sm leading-6 text-slate-600">{step.description}</p>
                <Link href={step.href} className="secondary-button mt-6 h-10 w-full px-4">
                  {step.action}<ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.72fr]">
          <div className="accent-card rounded-2xl border p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><CheckCircle2 className="h-4 w-4" />当前可交付能力</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {["需求不足时暂停追问", "Planner 与多 Agent 评审循环", "三套报告可导出和交接", "真实运行证据后才能验收"].map((item) => <div key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-700"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{item}</div>)}
            </div>
          </div>
          <div className="secondary-card rounded-2xl border p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Bot className="h-4 w-4 text-[#5965F2]" />基础工作台</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">需要配置 Agent、知识库或直接调试对话时，进入原有多 Agent 工作台。它是支撑工具，不是最终交付物。</p>
            <button type="button" onClick={onOpenWorkspace} className="primary-button mt-6 h-10 w-full px-4">进入 Agent 工作台<ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
      </div>
    </main>
  );
}

const initialWorkspace: WorkspaceSnapshot = {
  id: "local",
  name: "AgentForge Local Workspace",
  description: "Local multi-agent workspace for requirement clarification and product/UI implementation reports",
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
            <h1 className="mt-2 text-2xl font-bold">{isRegister ? "创建账号" : "登录工作台"}</h1>
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
