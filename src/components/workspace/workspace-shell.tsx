"use client";

import { Bot, Boxes, GitBranch, Languages, MessageSquareText, Moon, Settings, Sparkles, Sun } from "lucide-react";
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
  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-slate-200 bg-[#F5F7FA]">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#5B5BD6] text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">AIWorkbench</div>
          <div className="text-xs text-slate-500">{t.productSubtitle}</div>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActivePage(item.key)}
            className={cn("flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition", activePage === item.key ? "bg-white font-medium text-[#5B5BD6] shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900")}
          >
            <item.icon className="h-4 w-4" />
            {t.nav[item.key]}
          </button>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">{t.siderHint}</div>
      </div>
    </aside>
  );
}

export function TopBar({ t, activePage, notice, language, setLanguage, theme, setTheme }: { t: Copy; activePage: PageKey; notice: string | null; language: Language; setLanguage: (language: Language) => void; theme: ThemeMode; setTheme: (theme: ThemeMode) => void }) {
  const isZh = t.language === "语言";
  const themeLabel = theme === "dark" ? (isZh ? "切换到浅色" : "Switch to light") : (isZh ? "切换到深色" : "Switch to dark");
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">{t.nav[activePage]}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.topDescription}</p>
      </div>
      <div className="flex items-center gap-3">
        {notice && <div className="max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm" role="status" aria-live="polite">{notice}</div>}
        <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="icon-button" aria-label={themeLabel} title={themeLabel}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm" aria-label={t.language}>
          <Languages className="mx-2 h-4 w-4 text-slate-400" />
          {(["zh", "en"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setLanguage(item)} className={cn("h-8 rounded-md px-3 text-xs font-medium transition", language === item ? "bg-[#5B5BD6] text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>
              {t[item]}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
