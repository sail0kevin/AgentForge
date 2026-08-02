"use client";

import { Activity, Bot, Boxes, GitBranch, Languages, MessageSquareText, Moon, Settings, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Copy, Language } from "./workspace-copy";
import type { PageKey, ThemeMode } from "./workspace-types";

const navItems: { key: PageKey; icon: typeof MessageSquareText }[] = [
  { key: "chat", icon: MessageSquareText },
  { key: "creator", icon: Bot },
  { key: "tools", icon: Boxes },
  { key: "dashboard", icon: GitBranch },
  { key: "settings", icon: Settings },
];

export function GlobalSider({ t, activePage, setActivePage }: { t: Copy; activePage: PageKey; setActivePage: (page: PageKey) => void }) {
  const isZh = t.language === "语言";

  return (
    <aside className="app-sider flex shrink-0 flex-col">
      <div className="app-brand flex items-center gap-3 px-5">
        <div className="brand-mark relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white">
          <Sparkles className="h-[18px] w-[18px]" />
          <span className="brand-dot" />
        </div>
        <div className="app-brand-copy relative z-10 min-w-0">
          <div className="truncate text-[15px] font-bold tracking-[-0.02em] text-slate-950">AgentForge</div>
          <div className="mt-0.5 truncate text-[11px] font-medium tracking-wide text-slate-500">{t.productSubtitle}</div>
        </div>
      </div>

      <div className="px-3 pt-5">
        <div className="nav-label mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {isZh ? "工作台" : "Workspace"}
        </div>
        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActivePage(item.key)}
              className={cn(
                "nav-item flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                activePage === item.key ? "nav-item-active text-[#505BE0]" : "text-slate-600 hover:text-slate-900",
              )}
              title={t.nav[item.key]}
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors", activePage === item.key ? "bg-indigo-50 text-[#5965F2]" : "bg-transparent text-slate-400")}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="nav-label truncate">{t.nav[item.key]}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4">
        <div className="sider-note rounded-2xl p-3.5 text-xs leading-5 text-slate-500">
          <div className="mb-2 flex items-center gap-2 font-semibold text-slate-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {isZh ? "本地引擎已就绪" : "Local engine ready"}
          </div>
          {t.siderHint}
        </div>
      </div>
    </aside>
  );
}

export function TopBar({ t, activePage, notice, language, setLanguage, theme, setTheme }: { t: Copy; activePage: PageKey; notice: string | null; language: Language; setLanguage: (language: Language) => void; theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  const isZh = t.language === "语言";
  const themeLabel = theme === "dark" ? (isZh ? "切换到浅色" : "Switch to light") : (isZh ? "切换到深色" : "Switch to dark");

  return (
    <header className="top-bar mb-6 flex items-start justify-between gap-5">
      <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5965F2]">
           <Activity className="h-3.5 w-3.5" />
          AgentForge / {isZh ? "产品/UI报告工作台" : "Product/UI report workspace"}
          </div>
        <h1 className="page-title truncate text-[26px] font-bold tracking-[-0.035em]">{t.nav[activePage]}</h1>
        <p className="page-description mt-1.5 text-sm leading-6 text-slate-500">{t.topDescription}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
        {notice && <div className="notice-pill max-w-md rounded-xl border px-3.5 py-2 text-xs shadow-sm" role="status" aria-live="polite">{notice}</div>}
        <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="icon-button" aria-label={themeLabel} title={themeLabel}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <div className="language-switcher flex items-center gap-1 rounded-xl border p-1 shadow-sm" aria-label={t.language}>
          <Languages className="mx-1.5 h-4 w-4 text-slate-400" />
          {(["zh", "en"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setLanguage(item)} className={cn("h-8 rounded-lg px-3 text-xs font-semibold transition", language === item ? "bg-[#5965F2] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-900")}>
              {t[item]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
