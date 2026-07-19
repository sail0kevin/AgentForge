import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/types";

export function Avatar({ agent, small = false }: { agent: Pick<AgentConfig, "avatar" | "color">; small?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl border border-white/25 text-xs font-bold text-white shadow-[0_7px_16px_rgba(31,55,90,0.15)]",
        small ? "h-7 w-7 rounded-lg text-[10px]" : "h-10 w-10",
      )}
      style={{ background: `linear-gradient(145deg, ${agent.color}, color-mix(in srgb, ${agent.color} 72%, #111827))` }}
    >
      {agent.avatar}
      {!small && <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />}
    </div>
  );
}

export function Panel({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="panel rounded-2xl border p-5 transition duration-300">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#6975FF] to-[#22BFA6]" />
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-[-0.015em] text-slate-950">{title}</h2>
          {desc && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block rounded-2xl border p-5 transition duration-300">
      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-2.5 text-2xl font-bold tracking-[-0.03em] text-slate-950">{value}</p>
        <div className="mt-3 h-1 w-10 rounded-full bg-gradient-to-r from-[#6975FF] to-[#2BC6AE]" />
      </div>
    </div>
  );
}
