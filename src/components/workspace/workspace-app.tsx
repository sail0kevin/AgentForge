"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultCapabilities, getEnabledDefaultCapabilityIds } from "@/lib/capabilities/registry";
import type { Provider, RunEvent, WorkspaceSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useAgentStore } from "@/store/agent-store";
import { removeLegacyUnscopedWorkspaceData } from "@/lib/client/user-storage";
import { getApiErrorMessage } from "@/lib/client/api-error";
import { AgentCreator } from "./workspace-agent-manager";
import { ChatWorkspace } from "./workspace-chat";
import { copy, type Language } from "./workspace-copy";
import { SequenceDashboard } from "./workspace-dashboard";
import { SystemSettings } from "./workspace-settings";
import { GlobalSider, TopBar } from "./workspace-shell";
import { ToolLibrary, ToolPicker } from "./workspace-tools";
import type { AgentForm, DocumentItem, LocalAgent, PageKey, ThemeMode, WorkspaceCapability } from "./workspace-types";

export type { Copy, Language } from "./workspace-copy";
export type { AgentForm, DocumentItem, LocalAgent, PageKey, ThemeMode, WorkspaceCapability } from "./workspace-types";

const LOCAL_LANGUAGE_KEY = "multi-agent-workspace.language.v1";
const LOCAL_THEME_KEY = "multi-agent-workspace.theme.v1";


const defaultWorkspaceCapabilities: WorkspaceCapability[] = defaultCapabilities.map((capability) => ({
  ...capability,
  enabled: capability.enabledByDefault,
}));

function sourceToProvider(source: string): Provider {
  if (source === "Anthropic") return "anthropic";
  if (source === "DeepSeek") return "deepseek";
  if (source === "Ollama") return "ollama";
  if (source === "Custom") return "custom";
  return "openai";
}

function sourceToApiUrl(source: string) {
  if (source === "Ollama") return "http://localhost:11434";
  if (source === "DeepSeek") return "https://api.deepseek.com";
  if (source === "Anthropic") return "https://api.anthropic.com";
  if (source === "OpenAI Compatible") return "https://api.openai.com/v1";
  return "";
}

function defaultModelForSource(source: string) {
  if (source === "Ollama") return "llama3.1";
  if (source === "DeepSeek") return "deepseek-chat";
  if (source === "Anthropic") return "claude-3-5-sonnet-latest";
  if (source === "Custom") return "";
  return "gpt-4o-mini";
}

function createAgentForm(source = "Ollama"): AgentForm {
  return {
    name: "",
    avatar: "AI",
    color: "#5B5BD6",
    provider: sourceToProvider(source),
    model: defaultModelForSource(source),
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 1200,
  };
}

function loadLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(LOCAL_LANGUAGE_KEY) === "en" ? "en" : "zh";
}

function saveLanguage(language: Language) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_LANGUAGE_KEY, language);
}

function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(LOCAL_THEME_KEY) === "dark" ? "dark" : "light";
}

function saveTheme(theme: ThemeMode) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_THEME_KEY, theme);
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

export function WorkspaceApp({ initialWorkspace }: { initialWorkspace: WorkspaceSnapshot }) {
  const [activePage, setActivePage] = useState<PageKey>("chat");
  const [language, setLanguage] = useState<Language>("zh");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const t = copy[language];
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSnapshot[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const {
    agents: localAgents,
    loadAgents,
    addAgent,
    updateAgent,
    removeAgent,
    toggleAgent,
  } = useAgentStore();
  const [capabilities, setCapabilities] = useState<WorkspaceCapability[]>(defaultWorkspaceCapabilities);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(getEnabledDefaultCapabilityIds());
  const [agentSource, setAgentSource] = useState("Ollama");
  const [agentApiUrl, setAgentApiUrl] = useState(sourceToApiUrl("Ollama"));
  const [agentForm, setAgentForm] = useState<AgentForm>(() => createAgentForm("Ollama"));
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  // 临时密钥仅由表单状态持有，提交后立即清空，绝不写入 LocalAgent/store。
  const [agentApiKey, setAgentApiKey] = useState("");
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentUploading, setDocumentUploading] = useState(false);
  const runLockRef = useRef(false);
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const sessionActiveRef = useRef(false);
  const { messages, activeAgentId, isRunning, error, totalSpent, budgetStatus, setWorkspace, beginRun, applyEvent } = useWorkspaceStore();

  const visibleMessages = useMemo(() => messages.filter((message) => message.role !== "orchestrator"), [messages]);
  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null, [activeWorkspaceId, workspaces]);
  const enabledAgents = useMemo(() => activeWorkspace?.agents.map((agent) => localAgents.find((item) => item.id === agent.id)).filter((agent): agent is LocalAgent => Boolean(agent)) ?? [], [activeWorkspace, localAgents]);

  function selectTaskWorkspace(id: string) {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace || isRunning) return;
    setActiveWorkspaceId(workspace.id);
    setWorkspace(workspace);
    setInput("");
    setNotice(null);
  }

  async function createTaskWorkspace(input: { name: string; description: string; agentIds: string[] }) {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, mode: "sequential", budgetLimit: 10 }),
    });
    if (!response.ok) throw new Error(await getApiErrorMessage(response, "创建对话空间失败。"));
    const workspace = await response.json() as WorkspaceSnapshot;
    setWorkspaces((items) => [...items, workspace]);
    setActiveWorkspaceId(workspace.id);
    setWorkspace(workspace);
    setNotice(t.language === "语言" ? `已创建对话空间：${workspace.name}` : `Task space created: ${workspace.name}`);
  }

  async function updateTaskWorkspace(id: string, input: { name: string; description: string; agentIds: string[] }) {
    const current = workspaces.find((item) => item.id === id);
    const response = await fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, mode: current?.mode ?? "sequential", budgetLimit: current?.budgetLimit ?? 10 }),
    });
    if (!response.ok) throw new Error(await getApiErrorMessage(response, "更新对话空间失败。"));
    const workspace = await response.json() as WorkspaceSnapshot;
    setWorkspaces((items) => items.map((item) => item.id === workspace.id ? workspace : item));
    setActiveWorkspaceId(workspace.id);
    setWorkspace(workspace);
    setNotice(t.language === "语言" ? `已更新对话空间：${workspace.name}` : `Task space updated: ${workspace.name}`);
  }

  /** 删除入口统一处理确认、进行中状态、失败反馈和编辑状态复位。 */
  const handleDeleteAgent = useCallback(async (agent: LocalAgent) => {
    if (deletingAgentId || !window.confirm(interpolate(t.deleteConfirm, { name: agent.name }))) return;
    setDeletingAgentId(agent.id);
    try {
      await removeAgent(agent.id);
      if (editingAgentId === agent.id) {
        setEditingAgentId(null);
        setAgentForm(createAgentForm(agentSource));
        setSelectedToolIds(getEnabledDefaultCapabilityIds());
        setAgentApiKey("");
      }
      setNotice(interpolate(t.agentDeleted, { name: agent.name }));
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : t.agentDeleteFailed);
    } finally {
      setDeletingAgentId(null);
    }
  }, [agentSource, deletingAgentId, editingAgentId, removeAgent, t]);

  useEffect(() => {
    sessionActiveRef.current = true;
    useWorkspaceStore.getState().clearSession();
    useAgentStore.getState().clearSession();
    removeLegacyUnscopedWorkspaceData(window.localStorage);
    queueMicrotask(() => {
      setLanguage(loadLanguage());
      setTheme(loadTheme());
      void (async () => {
        await loadAgents();
        if (!sessionActiveRef.current) return;
        const agents = useAgentStore.getState().agents;
        const response = await fetch("/api/workspaces");
        if (!response.ok || !sessionActiveRef.current) return;
        let taskSpaces = await response.json() as WorkspaceSnapshot[];
        const defaultAgentIds = agents.filter((agent) => agent.name === "需求分析师" || agent.name === "开发报告负责人").map((agent) => agent.id);
        if (!taskSpaces.some((workspace) => workspace.name === "开发报告生成") && defaultAgentIds.length === 2) {
          const createDefault = await fetch("/api/workspaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "开发报告生成", description: "需求分析师与开发报告负责人协作生成详细开发报告。", mode: "sequential", budgetLimit: 10, agentIds: defaultAgentIds }),
          });
          if (createDefault.ok) taskSpaces = [...taskSpaces, await createDefault.json() as WorkspaceSnapshot];
        }
        if (!sessionActiveRef.current) return;
        setWorkspaces(taskSpaces);
        const preferred = taskSpaces.find((workspace) => workspace.name === "开发报告生成") ?? taskSpaces[0] ?? null;
        if (preferred) {
          setActiveWorkspaceId(preferred.id);
          setWorkspace(preferred);
        } else {
          setWorkspace({ ...initialWorkspace, agents: [], messages: [], totalSpent: 0, status: "idle" });
        }
      })();
    });
    return () => {
      sessionActiveRef.current = false;
      runAbortControllerRef.current?.abort();
      runAbortControllerRef.current = null;
      useWorkspaceStore.getState().clearSession();
      useAgentStore.getState().clearSession();
    };
  }, [initialWorkspace, setWorkspace, loadAgents]);

  const updateLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    saveLanguage(nextLanguage);
  }, []);

  const updateTheme = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    saveTheme(nextTheme);
  }, []);

  /** 从 GET /api/documents 加载当前用户的知识文档；进入能力库页面时自动刷新。 */
  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data as DocumentItem[]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activePage === "tools") {
      queueMicrotask(() => { void loadDocuments(); });
    }
  }, [activePage, loadDocuments]);

  async function uploadDocument(file: File) {
    setDocumentUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Document upload failed."));
      }
      await loadDocuments();
      setNotice(t.language === "语言" ? "知识文档已上传。已绑定 RAG 的智能体会在运行前检索它。" : "Knowledge document uploaded. Agents bound to RAG will retrieve it before runs.");
    } catch (uploadError) {
      setNotice(uploadError instanceof Error ? uploadError.message : "Document upload failed.");
    } finally {
      setDocumentUploading(false);
    }
  }

  /** 删除指定知识文档；服务端同时删除它的检索分块。 */
  async function deleteDocument(id: string) {
    try {
      if (!window.confirm(t.language === "语言" ? "确定删除这份知识文档及其全部检索块吗？" : "Delete this knowledge document and all of its chunks?")) return;
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Document deletion failed.");
      setDocuments((docs) => docs.filter((doc) => doc.id !== id));
    } catch (deleteError) {
      setNotice(deleteError instanceof Error ? deleteError.message : "Document deletion failed.");
    }
  }

  function syncAgentSource(source: string) {
    setAgentSource(source);
    setAgentApiUrl(sourceToApiUrl(source));
    setAgentForm((current) => ({ ...current, provider: sourceToProvider(source), model: defaultModelForSource(source) }));
  }

  async function addLocalAgent() {
    const name = agentForm.name.trim();
    const systemPrompt = agentForm.systemPrompt.trim();
    if (!name) return setNotice(t.needName);
    if (!systemPrompt) return setNotice(t.needPrompt);

    const next: LocalAgent = {
      ...agentForm,
      id: editingAgentId ?? "pending-agent-id",
      name,
      systemPrompt,
      avatar: name.slice(0, 2).toUpperCase(),
      provider: sourceToProvider(agentSource),
      enabled: localAgents.find((agent) => agent.id === editingAgentId)?.enabled ?? true,
      source: agentSource,
      apiUrl: agentApiUrl.trim(),
      credentialConfigured: localAgents.find((agent) => agent.id === editingAgentId)?.credentialConfigured ?? agentSource === "Ollama",
      maskedKey: localAgents.find((agent) => agent.id === editingAgentId)?.maskedKey ?? null,
      keyLength: localAgents.find((agent) => agent.id === editingAgentId)?.keyLength ?? null,
      tools: selectedToolIds,
      capabilityIds: selectedToolIds,
    };
    try {
      if (editingAgentId) {
        await updateAgent(editingAgentId, { ...next, apiKey: agentApiKey });
      } else {
        await addAgent({ ...next, apiKey: agentApiKey });
      }
      setNotice(interpolate(editingAgentId ? t.agentUpdated : t.agentAdded, { name: next.name }));
      setEditingAgentId(null);
      setAgentForm(createAgentForm(agentSource));
      // 密钥已交给服务端，立即从浏览器表单状态清空。
      setAgentApiKey("");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : t.sendFailed);
    }
  }

  function editLocalAgent(agent: LocalAgent) {
    setEditingAgentId(agent.id);
    setAgentSource(agent.source);
    setAgentApiUrl(agent.apiUrl);
    setSelectedToolIds(agent.capabilityIds ?? agent.tools ?? []);
    setAgentForm({
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    });
    setAgentApiKey("");
    setNotice(interpolate(t.editingAgent, { name: agent.name }));
  }

  function cancelAgentEdit() {
    setEditingAgentId(null);
    setAgentForm(createAgentForm(agentSource));
    setSelectedToolIds(getEnabledDefaultCapabilityIds());
    setAgentApiKey("");
    setNotice(t.editCancelled);
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    // ref 是同步互斥锁，可以挡住首个 SSE 事件到达前的连续点击或连续按 Enter。
    if (!prompt || isRunning || runLockRef.current) return;

    if (!activeWorkspace) {
      setNotice(t.selectWorkspaceFirst);
      return;
    }
    if (enabledAgents.length === 0) {
      setNotice(t.needAgent);
      return;
    }

    runLockRef.current = true;
    beginRun();

    setInput("");
    setNotice(null);

    try {
      const runAbortController = new AbortController();
      runAbortControllerRef.current = runAbortController;
      const response = await fetch(`/api/workspaces/${activeWorkspace.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt }),
        signal: runAbortController.signal,
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, t.callFailed));
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error(t.noStream);

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const chunk of events) {
          const line = chunk.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const runEvent = JSON.parse(line.replace("data: ", "")) as RunEvent;
          if (sessionActiveRef.current) applyEvent(runEvent);
        }
      }
    } catch (runError) {
      // 网络或 SSE 失败不能伪造成 Agent 成功回复；只展示真实错误并结束本地运行状态。
      if (sessionActiveRef.current) {
        applyEvent({
          type: "error",
          message: runError instanceof Error ? runError.message : t.sendFailed,
        });
        setNotice(runError instanceof Error ? runError.message : t.sendFailed);
      }
    } finally {
      runLockRef.current = false;
      runAbortControllerRef.current = null;
    }
  }

  async function clearChat() {
    if (isRunning || !activeWorkspace) return;
    const previousWorkspace = useWorkspaceStore.getState().workspace;
    try {
      const response = await fetch(`/api/workspaces/${activeWorkspace.id}/messages`, { method: "DELETE" });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "清空对话失败。"));
      const workspace = await response.json() as WorkspaceSnapshot;
      setWorkspaces((items) => items.map((item) => item.id === workspace.id ? workspace : item));
      setWorkspace(workspace);
      setNotice(t.clearDone);
    } catch (clearError) {
      if (previousWorkspace) setWorkspace(previousWorkspace);
      setNotice(clearError instanceof Error ? clearError.message : t.sendFailed);
    }
  }

  function cancelCurrentRun() {
    runAbortControllerRef.current?.abort();
    setNotice(t.language === "语言" ? "已请求取消本次运行，正在释放模型连接。" : "Cancellation requested. Releasing the model connection.");
  }

  const content = {
    chat: (
      <ChatWorkspace
        t={t}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        allAgents={localAgents}
        agents={enabledAgents}
        enabledCount={enabledAgents.length}
        onSelectWorkspace={selectTaskWorkspace}
        onCreateWorkspace={createTaskWorkspace}
        onUpdateWorkspace={updateTaskWorkspace}
        messages={visibleMessages}
        activeAgentId={activeAgentId}
        isRunning={isRunning}
        error={error}
        input={input}
        setInput={setInput}
        onRun={handleRun}
        onCancelRun={cancelCurrentRun}
        onAddAgent={() => setActivePage("creator")}
        onClearChat={clearChat}
      />
    ),
    creator: (
      <AgentCreator
        t={t}
        agents={localAgents}
        editingAgentId={editingAgentId}
        form={agentForm}
        setForm={setAgentForm}
        source={agentSource}
        setSource={syncAgentSource}
        apiUrl={agentApiUrl}
        setApiUrl={setAgentApiUrl}
        selectedToolIds={selectedToolIds}
        tools={capabilities}
        apiKey={agentApiKey}
        setApiKey={setAgentApiKey}
        onDeleteAgent={handleDeleteAgent}
        deletingAgentId={deletingAgentId}
        toggleAgent={toggleAgent}
        onEditAgent={editLocalAgent}
        onCancelEdit={cancelAgentEdit}
        setToolPickerOpen={setToolPickerOpen}
        onSubmit={(event) => {
          event.preventDefault();
          void addLocalAgent();
        }}
      />
    ),
    tools: <ToolLibrary t={t} tools={capabilities} setTools={setCapabilities} documents={documents} uploading={documentUploading} onUpload={uploadDocument} onDelete={deleteDocument} />,
    dashboard: <SequenceDashboard t={t} agents={enabledAgents} messages={visibleMessages} totalSpent={totalSpent} budgetStatus={budgetStatus} />,
    settings: <SystemSettings t={t} />,
  } satisfies Record<PageKey, ReactNode>;

  return (
    <div data-theme={theme} className={cn("theme-root flex h-screen min-h-[760px] text-slate-800", theme === "dark" ? "theme-dark" : "")}>
      <GlobalSider t={t} activePage={activePage} setActivePage={setActivePage} />
      <main className="page-main min-w-0 flex-1 overflow-y-auto">
        <TopBar t={t} activePage={activePage} notice={notice} language={language} setLanguage={updateLanguage} theme={theme} setTheme={updateTheme} />
        {content[activePage]}
      </main>
      {toolPickerOpen && <ToolPicker t={t} tools={capabilities} selectedToolIds={selectedToolIds} setSelectedToolIds={setSelectedToolIds} onClose={() => setToolPickerOpen(false)} />}
    </div>
  );
}
