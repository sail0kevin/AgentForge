"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Bot, FolderPlus, Loader2, Pencil, SendHorizontal, Square, UsersRound } from "lucide-react";
import type { AgentConfig, WorkspaceMessage, WorkspaceSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Copy } from "./workspace-copy";
import type { LocalAgent } from "./workspace-types";
import { Avatar } from "./workspace-primitives";

export function ChatWorkspace(props: {
  t: Copy;
  workspaces: WorkspaceSnapshot[];
  activeWorkspace: WorkspaceSnapshot | null;
  allAgents: LocalAgent[];
  agents: LocalAgent[];
  enabledCount: number;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (input: { name: string; description: string; agentIds: string[] }) => Promise<void>;
  onUpdateWorkspace: (id: string, input: { name: string; description: string; agentIds: string[] }) => Promise<void>;
  messages: WorkspaceMessage[];
  activeAgentId: string | null;
  isRunning: boolean;
  error: string | null;
  input: string;
  setInput: (value: string) => void;
  onRun: (event: FormEvent<HTMLFormElement>) => void;
  onCancelRun: () => void;
  onAddAgent: () => void;
  onClearChat: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const shortcutHint = props.t.language === "语言" ? "Enter 发送，Shift+Enter 换行" : "Enter to send, Shift+Enter for newline";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [props.input]);

  function openWorkspaceEditor(mode: "create" | "edit") {
    const active = props.activeWorkspace;
    setEditorMode(mode);
    setWorkspaceError(null);
    setWorkspaceName(mode === "edit" && active ? active.name : props.t.defaultWorkspaceName);
    setWorkspaceDescription(mode === "edit" && active ? active.description : props.t.defaultWorkspaceDescription);
    setSelectedAgentIds(mode === "edit" && active ? active.agents.map((agent) => agent.id) : []);
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name || savingWorkspace) return;
    setSavingWorkspace(true);
    try {
      const input = { name, description: workspaceDescription.trim(), agentIds: selectedAgentIds };
      if (editorMode === "edit" && props.activeWorkspace) await props.onUpdateWorkspace(props.activeWorkspace.id, input);
      else await props.onCreateWorkspace(input);
      setEditorMode(null);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to save task space.");
    } finally {
      setSavingWorkspace(false);
    }
  }

  return (
    <section className="chat-shell flex h-[calc(100vh-132px)] min-h-[620px] overflow-hidden rounded-2xl border shadow-sm">
      <aside className="chat-sidebar w-[300px] shrink-0 overflow-y-auto border-r p-3 max-lg:w-[72px]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 max-lg:hidden">
            <div className="text-sm font-semibold">{props.t.taskSpaces}</div>
            <div className="text-xs text-slate-500">{props.workspaces.length} {props.t.spaceCount}</div>
          </div>
          <button type="button" onClick={() => openWorkspaceEditor("create")} className="icon-button" aria-label={props.t.createWorkspace}><FolderPlus /></button>
        </div>
        <div className="space-y-2">
          {props.workspaces.map((workspace) => <button key={workspace.id} type="button" onClick={() => props.onSelectWorkspace(workspace.id)} className={cn("workspace-card w-full rounded-xl border p-3 text-left transition", workspace.id === props.activeWorkspace?.id ? "workspace-card-active" : "")}><div className="truncate text-sm font-medium text-slate-900">{workspace.name}</div><div className="mt-1 truncate text-xs text-slate-500">{workspace.description || props.t.workspaceNoDescription}</div><div className="mt-2 text-[11px] text-slate-500">{workspace.agents.length} {props.t.workspaceAgentCount}</div></button>)}
          {props.workspaces.length === 0 && <button type="button" onClick={() => openWorkspaceEditor("create")} className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500"><FolderPlus className="h-5 w-5 text-[#5B5BD6]" /><span>{props.t.createFirstWorkspace}</span></button>}
        </div>
        {props.activeWorkspace && <div className="mt-5 border-t border-slate-200 pt-4"><div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-medium text-slate-600 max-lg:hidden"><UsersRound className="h-4 w-4" />{props.t.workspaceAgents}</div><button type="button" onClick={() => openWorkspaceEditor("edit")} className="icon-button" aria-label={props.t.editWorkspace}><Pencil /></button></div><AgentList t={props.t} agents={props.agents} onAddAgent={props.onAddAgent} /></div>}
      </aside>
      <div className="chat-main flex min-w-0 flex-1 flex-col">
        <div className="chat-toolbar flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">{props.activeWorkspace?.name ?? props.t.currentChat}</div>
            <div className="text-xs text-slate-500">{props.activeWorkspace?.description || props.t.chatTargetHint}</div>
          </div>
          <button type="button" onClick={props.onClearChat} disabled={props.isRunning || !props.activeWorkspace} className="secondary-button h-9 px-3 disabled:cursor-not-allowed disabled:opacity-50">{props.t.clearChat}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {props.messages.length === 0 && <EmptyChat t={props.t} onConfigureWorkspace={() => openWorkspaceEditor(props.activeWorkspace ? "edit" : "create")} />}
            {props.messages.map((message) => <MessageBubble key={message.id} t={props.t} message={message} agent={props.agents.find((agent) => agent.id === message.agentId)} />)}
            {props.activeAgentId && <ThinkingBubble t={props.t} agent={props.agents.find((agent) => agent.id === props.activeAgentId)} />}
          </div>
        </div>
        <form onSubmit={props.onRun} className="chat-composer border-t p-4">
          {props.error && <div className="mx-auto mb-3 max-w-4xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{props.error}</div>}
          <div className="composer-box mx-auto flex max-w-4xl items-end gap-3 rounded-2xl border p-2.5 shadow-sm">
            <textarea
              ref={textareaRef}
              className="max-h-40 min-h-11 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
              rows={1}
              value={props.input}
              onChange={(event) => props.setInput(event.target.value)}
              placeholder={props.activeWorkspace ? props.t.inputPlaceholder : props.t.selectWorkspaceFirst}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex shrink-0 flex-col items-end gap-1">
              {props.isRunning ? <button type="button" onClick={props.onCancelRun} className="secondary-button h-10 px-4 text-red-600"><Square className="h-3.5 w-3.5 fill-current" />取消</button> : <button type="submit" disabled={!props.input.trim() || !props.activeWorkspace} className="primary-button h-10 px-4">
                {props.isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}{props.t.send}
              </button>}
              <span className="text-[11px] text-slate-400">{shortcutHint}</span>
            </div>
          </div>
        </form>
      </div>
      {editorMode && <WorkspaceEditor t={props.t} mode={editorMode} name={workspaceName} description={workspaceDescription} selectedAgentIds={selectedAgentIds} agents={props.allAgents} saving={savingWorkspace} error={workspaceError} setName={setWorkspaceName} setDescription={setWorkspaceDescription} setSelectedAgentIds={setSelectedAgentIds} onClose={() => setEditorMode(null)} onSubmit={saveWorkspace} />}
    </section>
  );
}

function AgentList({ t, agents, onAddAgent }: { t: Copy; agents: LocalAgent[]; onAddAgent: () => void }) {
  if (agents.length === 0) {
    return <button type="button" onClick={onAddAgent} className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500 max-lg:p-2"><Bot className="h-5 w-5 text-[#5B5BD6]" /><span className="max-lg:hidden">{t.noAgents}</span></button>;
  }
  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div key={agent.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm max-lg:p-2">
          <div className="flex items-start gap-3">
            <Avatar agent={agent} />
            <div className="min-w-0 flex-1 max-lg:hidden"><div className="truncate text-sm font-medium text-slate-900">{agent.name}</div><div className="mt-1 truncate text-xs text-slate-500">{agent.source} / {agent.model}</div></div>
          </div>
          <div className="mt-3 text-[11px] text-emerald-600 max-lg:hidden">{t.workspaceMember}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyChat({ t, onConfigureWorkspace }: { t: Copy; onConfigureWorkspace: () => void }) {
  return <div className="mx-auto mt-24 max-w-md rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[#5B5BD6]"><Bot className="h-5 w-5" /></div><p className="mt-3 text-sm text-slate-500">{t.noMessages}</p><button type="button" onClick={onConfigureWorkspace} className="secondary-button mx-auto mt-4 h-9 px-3"><UsersRound className="h-4 w-4" />{t.configureWorkspace}</button></div>;
}

function WorkspaceEditor({ t, mode, name, description, selectedAgentIds, agents, saving, error, setName, setDescription, setSelectedAgentIds, onClose, onSubmit }: { t: Copy; mode: "create" | "edit"; name: string; description: string; selectedAgentIds: string[]; agents: LocalAgent[]; saving: boolean; error: string | null; setName: (value: string) => void; setDescription: (value: string) => void; setSelectedAgentIds: (ids: string[]) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true"><form onSubmit={(event) => void onSubmit(event)} className="modal-card w-full max-w-xl rounded-2xl border p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950">{mode === "create" ? t.createWorkspace : t.editWorkspace}</h2><p className="mt-1 text-sm text-slate-500">{t.workspaceEditorDesc}</p></div><button type="button" onClick={onClose} className="secondary-button h-9 px-3">{t.cancel}</button></div>{error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<label className="mt-5 block text-sm font-medium text-slate-800">{t.workspaceName}<input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.defaultWorkspaceName} maxLength={120} required /></label><label className="mt-4 block text-sm font-medium text-slate-800">{t.workspaceDescription}<textarea className="field mt-1 min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label><div className="mt-5"><div className="text-sm font-medium text-slate-800">{t.selectWorkspaceAgents}</div><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{agents.length === 0 && <div className="text-sm text-slate-500">{t.noAgents}</div>}{agents.map((agent) => { const checked = selectedAgentIds.includes(agent.id); return <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={() => setSelectedAgentIds(checked ? selectedAgentIds.filter((id) => id !== agent.id) : [...selectedAgentIds, agent.id])} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{agent.name}</span><span className="block truncate text-xs text-slate-500">{agent.source} / {agent.model}</span></span></label>; })}</div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="secondary-button h-10 px-4">{t.cancel}</button><button type="submit" disabled={saving || !name.trim()} className="primary-button h-10 px-4">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}{mode === "create" ? t.createWorkspace : t.saveChanges}</button></div></form></div>;
}

function MessageBubble({ t, message, agent }: { t: Copy; message: WorkspaceMessage; agent?: AgentConfig }) {
  const isUser = message.role === "user";
  const isFailed = !isUser && message.failed;
  return <div className={cn("flex", isUser ? "justify-end" : "justify-start")}><div className={cn("message-bubble max-w-[76%] rounded-2xl border p-4 text-sm leading-6", isUser ? "message-bubble-user" : isFailed ? "border-red-200 bg-red-50 shadow-sm" : "bg-white/80")}><div className="mb-2 flex items-center gap-2 text-xs text-slate-500">{!isUser && agent && <Avatar agent={agent} small />}<span>{isUser ? t.you : agent?.name ?? "AI"}</span>{isFailed && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">{t.callFailed}</span>}</div><p className="whitespace-pre-wrap text-slate-700">{message.content}</p></div></div>;
}

function ThinkingBubble({ t, agent }: { t: Copy; agent?: AgentConfig }) {
  return <div className="flex justify-start" role="status" aria-live="polite"><div className="thinking-bubble rounded-2xl border p-4 text-sm text-[#5B5BD6] shadow-sm"><div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{agent?.name ?? "AI"} {t.thinking}</div></div></div>;
}
