import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/types";

export function Avatar({ agent, small = false }: { agent: Pick<AgentConfig, "avatar" | "color">; small?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white", small ? "h-6 w-6" : "h-9 w-9")} style={{ backgroundColor: agent.color }}>
      {agent.avatar}
    </div>
  );
}

export function Panel({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
