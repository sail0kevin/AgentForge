"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Loader2, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Copy } from "./workspace-copy";
import type { AgentForm, LocalAgent, WorkspaceCapability } from "./workspace-types";
import { Avatar, Field, Panel } from "./workspace-primitives";

const sourceOptions = ["Ollama", "OpenAI Compatible", "DeepSeek", "Anthropic", "Custom"];
const sourceLabels: Record<string, string> = {
  Ollama: "Ollama",
  "OpenAI Compatible": "OpenAI Compatible",
  DeepSeek: "DeepSeek",
  Anthropic: "Anthropic",
  Custom: "Custom OpenAI-compatible",
};

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

export function AgentCreator(props: {
  t: Copy;
  agents: LocalAgent[];
  editingAgentId: string | null;
  form: AgentForm;
  setForm: (form: AgentForm) => void;
  source: string;
  setSource: (source: string) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  selectedToolIds: string[];
  tools: WorkspaceCapability[];
  apiKey: string;
  setApiKey: (value: string) => void;
  onDeleteAgent: (agent: LocalAgent) => Promise<void>;
  deletingAgentId: string | null;
  toggleAgent: (id: string) => void;
  onEditAgent: (agent: LocalAgent) => void;
  onCancelEdit: () => void;
  setToolPickerOpen: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedTools = props.tools.filter((tool) => props.selectedToolIds.includes(tool.id));
  const editingAgent = props.agents.find((agent) => agent.id === props.editingAgentId);
  // 圆点只是“已安全保存”的视觉提示，不是密钥、密文或其副本。
  // 因此即使用户直接点击保存，提交的仍是空值，旧密钥不会被覆盖。
  const [keyReplacementStartedFor, setKeyReplacementStartedFor] = useState<string | null>(null);
  const hasSavedKey = Boolean(editingAgent?.credentialConfigured);
  const displaysSavedKeyMask = hasSavedKey && keyReplacementStartedFor !== editingAgent?.id && !props.apiKey;
  const savedKeyMask = "•".repeat(editingAgent?.keyLength && editingAgent.keyLength > 0 ? editingAgent.keyLength : 12);

  function revealKeyReplacementField() {
    if (displaysSavedKeyMask) setKeyReplacementStartedFor(editingAgent?.id ?? null);
  }

  function restoreSavedKeyMask() {
    if (hasSavedKey && !props.apiKey) setKeyReplacementStartedFor(null);
  }

  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-5 max-xl:grid-cols-1">
      <Panel title={props.t.currentAgents} desc={props.t.currentAgentsDesc}>
        <div className="space-y-3">
          {props.agents.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{props.t.emptyAgentsInCreator}</div>}
          {props.agents.map((agent) => (
            <div key={agent.id} className={cn("rounded-lg border bg-white p-3 shadow-sm", props.editingAgentId === agent.id ? "border-[#5B5BD6]" : "border-slate-200")}>
              <div className="flex items-start gap-3">
                <Avatar agent={agent} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-950">{agent.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{agent.source} / {agent.model}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{props.t.apiUrlLabel}: {agent.apiUrl || "-"}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs"><span className={cn("rounded px-1.5 py-0.5 font-medium", agent.credentialConfigured || agent.provider === "ollama" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{agent.credentialConfigured || agent.provider === "ollama" ? props.t.apiKeyConfigured : props.t.apiKeyMissing}</span></div>
                  <div className="mt-1 text-xs text-slate-500">{interpolate(props.t.capabilityNames, { names: (agent.capabilityIds ?? agent.tools ?? []).map((id) => props.tools.find((tool) => tool.id === id)?.name).filter(Boolean).join(", ") || props.t.noneSelected })}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={agent.enabled} onChange={() => props.toggleAgent(agent.id)} />{props.t.joinReply}</label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => props.onEditAgent(agent)} className="icon-button" aria-label={props.t.editAgent}><Pencil /></button>
                  <button type="button" onClick={() => void props.onDeleteAgent(agent)} disabled={props.deletingAgentId === agent.id} className="icon-button text-red-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label={props.t.deleteAgent}>{props.deletingAgentId === agent.id ? <Loader2 className="animate-spin" /> : <Trash2 />}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <form onSubmit={props.onSubmit} className="space-y-5">
        <Panel title={editingAgent ? interpolate(props.t.editAgentTitle, { name: editingAgent.name }) : props.t.createAgent} desc={props.t.createAgentDesc}>
          {editingAgent && <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-[#5B5BD6]"><span>{props.t.editingHint}</span><button type="button" onClick={props.onCancelEdit} className="secondary-button h-8 px-2"><X className="h-4 w-4" />{props.t.cancelEdit}</button></div>}
          <Field label={props.t.agentName}><input className="field" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} placeholder={props.t.agentNamePlaceholder} /></Field>
          <Field label={props.t.rolePrompt}><textarea className="field min-h-32" value={props.form.systemPrompt} onChange={(event) => props.setForm({ ...props.form, systemPrompt: event.target.value })} placeholder={props.t.promptPlaceholder} /></Field>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field label={props.t.modelSource}><select className="field" value={props.source} onChange={(event) => props.setSource(event.target.value)}>{sourceOptions.map((source) => <option key={source} value={source}>{sourceLabels[source]}</option>)}</select></Field>
            <Field label={props.t.modelName}><input className="field" value={props.form.model} onChange={(event) => props.setForm({ ...props.form, model: event.target.value })} placeholder="llama3.1 / gpt-4o-mini / deepseek-chat" /></Field>
          </div>
          <Field label="API URL"><input className="field" value={props.apiUrl} onChange={(event) => props.setApiUrl(event.target.value)} placeholder={props.t.apiUrlPlaceholder} /></Field>
          <Field label={props.t.apiKeyLabel}><input className="field" type="password" value={displaysSavedKeyMask ? savedKeyMask : props.apiKey} onFocus={revealKeyReplacementField} onBlur={restoreSavedKeyMask} onChange={(event) => props.setApiKey(event.target.value)} placeholder={props.source === "Ollama" ? props.t.ollamaKeyPlaceholder : props.t.apiKeyPlaceholder} autoComplete="new-password" aria-label={props.t.apiKeyLabel} /></Field>
          <p className="text-xs text-slate-500">{editingAgent ? interpolate(props.t.apiKeyKeepHint, { key: editingAgent.maskedKey ?? props.t.apiKeyMissing }) : props.t.apiKeyNewHint}</p>
        </Panel>
        <Panel title={props.t.capabilityBinding} desc={props.t.capabilityBindingDesc}>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3"><div><div className="text-sm font-medium text-slate-800">{interpolate(props.t.selectedCapabilities, { count: selectedTools.length })}</div><div className="mt-1 text-xs text-slate-500">{selectedTools.map((tool) => tool.name).join(", ") || props.t.noneSelected}</div></div><button type="button" onClick={() => props.setToolPickerOpen(true)} className="secondary-button h-9 px-3"><Search className="h-4 w-4" />{props.t.chooseCapabilities}</button></div>
        </Panel>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-[#F7F8FA]/95 py-4">
          {editingAgent && <button type="button" onClick={props.onCancelEdit} className="secondary-button h-10 px-4">{props.t.cancel}</button>}
          <button type="submit" className="primary-button h-10 px-4"><Save className="h-4 w-4" />{editingAgent ? props.t.saveChanges : props.t.addToChat}</button>
        </div>
      </form>
    </div>
  );
}
