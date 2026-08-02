"use client";

import { FormEvent, useEffect, useState } from "react";
import { Code2, FileText, GitBranch, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { WorkspaceApp } from "@/components/workspace/workspace-app";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useAgentStore } from "@/store/agent-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type SafeUser = { id: string; email: string; name: string | null };
type AuthMode = "login" | "register";

const initialWorkspace: WorkspaceSnapshot = {
  id: "local",
  name: "AgentForge Local Workspace",
  description: "Local sequential agent workspace for requirement analysis and development reports",
  mode: "sequential",
  budgetLimit: 999999,
  agents: [],
  messages: [],
  totalSpent: 0,
  status: "idle",
};

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
            <p className="mt-2 text-sm text-slate-500">{isRegister ? "注册后会自动登录，并使用独立的数据和凭证。" : "请登录后访问属于你的 Agent、对话和知识库。"}</p>
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
    <>
      <div className="global-account-bar fixed right-4 top-3 z-50 flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
        <Link href="/workflows" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><GitBranch className="h-3.5 w-3.5" />工作流</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <Link href="/scenarios" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><Code2 className="h-3.5 w-3.5" />工程分析</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <Link href="/reports" className="flex items-center gap-1 font-semibold text-[#5B5BD6]"><FileText className="h-3.5 w-3.5" />报告中心</Link>
        <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <span>{user.name || user.email}</span>
        <button type="button" onClick={logout} className="font-semibold text-[#5B5BD6]">退出登录</button>
      </div>
      <WorkspaceApp initialWorkspace={initialWorkspace} />
    </>
  );
}
