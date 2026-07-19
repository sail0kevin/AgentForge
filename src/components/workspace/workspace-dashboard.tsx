"use client";

import { useEffect, useState } from "react";
import type { WorkspaceMessage } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import type { Copy } from "./workspace-copy";
import type { LocalAgent } from "./workspace-types";
import { InfoBlock, Panel } from "./workspace-primitives";

type DashboardData = {
  agentCount: number;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  tokenStats: { inputTokens: number; outputTokens: number; costUsd: number };
  byProvider: { provider: string; count: number }[];
};

export function SequenceDashboard({ t, agents, messages, totalSpent, budgetStatus }: { t: Copy; agents: LocalAgent[]; messages: WorkspaceMessage[]; totalSpent: number; budgetStatus: string }) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const isZh = t.language === "语言";
  const dashboardText = {
    loading: isZh ? "正在加载真实运行数据..." : "Loading live workspace data...",
    error: isZh ? "数据看板加载失败，请稍后重试。" : "Failed to load dashboard data. Please try again later.",
    agentCount: isZh ? "数据库智能体" : "Database agents",
    messageCount: isZh ? "数据库消息" : "Database messages",
    userMessages: isZh ? "用户消息" : "User messages",
    assistantMessages: isZh ? "Agent 回复" : "Agent replies",
    inputTokens: isZh ? "输入 Token" : "Input tokens",
    outputTokens: isZh ? "输出 Token" : "Output tokens",
    databaseCost: isZh ? "数据库累计费用" : "Database cost",
    currentRunCost: isZh ? "当前会话费用" : "Current run cost",
    providerTitle: isZh ? "模型供应商分布" : "Provider distribution",
    providerDesc: isZh ? "按数据库中已创建的 Agent 供应商聚合统计。" : "Grouped by provider from persisted agents.",
    emptyProvider: isZh ? "还没有模型供应商数据。" : "No provider data yet.",
    providerAgentUnit: isZh ? "个 Agent" : "agents",
    localOverviewTitle: isZh ? "当前页面状态" : "Current page state",
    localOverviewDesc: isZh ? "这里显示浏览器当前已加载的 Agent 与消息，用于和数据库统计互相校验。" : "Loaded agents and messages in the current browser session for comparison.",
    loadedAgents: isZh ? "已加载 Agent" : "Loaded agents",
    visibleMessages: isZh ? "当前可见消息" : "Visible messages",
    budgetStatus: isZh ? "运行状态" : "Run status",
  };

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/dashboard/stats", { signal: controller.signal });
        if (!response.ok) throw new Error("fetch failed");
        setDashboardData(await response.json() as DashboardData);
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-5">
      <Panel title={t.sequenceTitle} desc={t.sequenceDesc}><div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">{t.sequenceSteps.map((step, index) => <div key={step} className="group rounded-xl border border-slate-200/70 bg-white/55 p-4 text-center text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white/90"><div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#6975FF] to-[#22BFA6] text-xs font-bold text-white shadow-[0_7px_15px_rgba(89,101,242,0.22)] transition group-hover:scale-110">{index + 1}</div>{step}</div>)}</div></Panel>
      {loading && <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-center text-sm text-slate-500 shadow-sm" role="status">{dashboardText.loading}</div>}
      {error && !loading && <div className="rounded-lg border border-slate-200 bg-white p-5 text-center text-sm text-red-500 shadow-sm" role="alert">{dashboardText.error}</div>}
      {dashboardData && !loading && <>
        <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
          <InfoBlock label={dashboardText.agentCount} value={String(dashboardData.agentCount ?? 0)} /><InfoBlock label={dashboardText.messageCount} value={String(dashboardData.messageCount ?? 0)} /><InfoBlock label={dashboardText.userMessages} value={String(dashboardData.userMessages ?? 0)} /><InfoBlock label={dashboardText.assistantMessages} value={String(dashboardData.assistantMessages ?? 0)} /><InfoBlock label={dashboardText.inputTokens} value={String(dashboardData.tokenStats?.inputTokens ?? 0)} /><InfoBlock label={dashboardText.outputTokens} value={String(dashboardData.tokenStats?.outputTokens ?? 0)} /><InfoBlock label={dashboardText.databaseCost} value={formatCurrency(dashboardData.tokenStats?.costUsd ?? 0)} /><InfoBlock label={dashboardText.currentRunCost} value={formatCurrency(totalSpent)} />
        </div>
        <Panel title={dashboardText.providerTitle} desc={dashboardText.providerDesc}><div className="grid gap-2">{dashboardData.byProvider.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{dashboardText.emptyProvider}</div>}{dashboardData.byProvider.map((item) => <div key={item.provider} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-medium text-slate-700">{item.provider}</span><span className="text-slate-500">{item.count} {dashboardText.providerAgentUnit}</span></div>)}</div></Panel>
        <Panel title={dashboardText.localOverviewTitle} desc={dashboardText.localOverviewDesc}><div className="grid grid-cols-3 gap-4 max-md:grid-cols-1"><InfoBlock label={dashboardText.loadedAgents} value={String(agents.length)} /><InfoBlock label={dashboardText.visibleMessages} value={String(messages.length)} /><InfoBlock label={dashboardText.budgetStatus} value={budgetStatus} /></div></Panel>
      </>}
    </div>
  );
}
