"use client";

import { Check, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Copy } from "./workspace-copy";
import type { DocumentItem, WorkspaceCapability } from "./workspace-types";
import { Panel } from "./workspace-primitives";

export function ToolLibrary({ t, tools, setTools, documents, uploading, onUpload, onDelete }: {
  t: Copy;
  tools: WorkspaceCapability[];
  setTools: (tools: WorkspaceCapability[]) => void;
  documents: DocumentItem[];
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <Panel title={t.capabilityLibrary} desc={t.capabilityLibraryDesc}>
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
          {tools.map((tool) => (
            <div key={tool.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-sm font-semibold text-slate-950">{tool.name}</div><div className="mt-1 text-xs text-slate-500">{tool.kind} · {tool.implementationStatus === "available" ? (t.language === "语言" ? "可用" : "Available") : (t.language === "语言" ? "规划中" : "Planned")}</div></div>
                <input type="checkbox" checked={tool.enabled && tool.implementationStatus === "available"} disabled={tool.implementationStatus !== "available"} onChange={(event) => setTools(tools.map((item) => (item.id === tool.id ? { ...item, enabled: event.target.checked } : item)))} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{tool.description}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={t.localRagKnowledge} desc={t.localRagDesc}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="max-w-xl text-sm text-slate-700">{t.language === "语言" ? "文档属于当前账号的共享知识库。只有在“创建智能体”中绑定了 RAG Retrieval 的智能体，才会在产品/UI报告生成前检索这些资料。" : "Documents belong to the current account's shared knowledge library. Only agents bound to RAG Retrieval retrieve them before product/UI report runs."}</p>
          <label className="primary-button h-9 cursor-pointer px-3">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{t.addKnowledge}
            <input type="file" className="sr-only" disabled={uploading} accept=".txt,.md,.markdown,.json,.csv,.log,.yaml,.yml,.ts,.js,.tsx,.jsx,.py,.java,.go,.rs,.c,.cpp,.h,.css,.html,.xml,.sh,.sql" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} />
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          {documents.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{t.emptyKnowledge}</div>}
          {documents.map((document) => (
            <div key={document.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#5B5BD6]" /><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-950">{document.title}</div><div className="mt-1 text-xs text-slate-500">{document.fileName} · {(document.size / 1024).toFixed(1)} KiB · {document._count?.chunks ?? 0} chunks</div><div className="mt-1 text-xs text-slate-500">v{document.sourceVersion ?? "1"} · {document.license ?? "unspecified"} · {new Date(document.createdAt).toLocaleString()}</div></div></div>
                <button type="button" onClick={() => void onDelete(document.id)} className="icon-button text-red-500" aria-label={t.deleteKnowledge}><Trash2 /></button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function ToolPicker({ t, tools, selectedToolIds, setSelectedToolIds, onClose }: { t: Copy; tools: WorkspaceCapability[]; selectedToolIds: string[]; setSelectedToolIds: (ids: string[]) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-6" role="dialog" aria-modal="true" aria-labelledby="tool-picker-title">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><div><h2 id="tool-picker-title" className="text-base font-semibold text-slate-950">{t.chooseCapabilityTitle}</h2><p className="mt-1 text-sm text-slate-500">{t.chooseCapabilityDesc}</p></div><button type="button" className="secondary-button h-9 px-3" onClick={onClose}>{t.done}</button></div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {tools.filter((tool) => tool.enabled).map((tool) => {
            const checked = selectedToolIds.includes(tool.id);
            return <button key={tool.id} type="button" onClick={() => setSelectedToolIds(checked ? selectedToolIds.filter((id) => id !== tool.id) : [...selectedToolIds, tool.id])} className={cn("rounded-lg border p-4 text-left transition", checked ? "border-[#5B5BD6] bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50")} aria-pressed={checked}><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-900">{tool.name}</span>{checked && <Check className="h-4 w-4 text-[#5B5BD6]" />}</div><p className="mt-2 text-xs leading-5 text-slate-500">{tool.description}</p></button>;
          })}
        </div>
      </div>
    </div>
  );
}
