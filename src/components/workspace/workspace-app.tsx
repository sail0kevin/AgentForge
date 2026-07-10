"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Boxes,
  Check,
  GitBranch,
  KeyRound,
  Languages,
  Loader2,
  MessageSquareText,\r\n  Moon,\r\n  Pencil,
  Plus,
  Save,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,\r\n  Sun,\r\n  Trash2,
  Wrench, Upload, FileText,
  X,
} from "lucide-react";
import { defaultCapabilities, getEnabledDefaultCapabilityIds } from "@/lib/capabilities/registry";
import type { AgentConfig, CapabilityDefinition, KnowledgeSnippet, Provider, RunEvent, WorkspaceMessage, WorkspaceSnapshot } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useAgentStore } from "@/store/agent-store";

type PageKey = "chat" | "creator" | "tools" | "dashboard" | "settings";
type Language = "zh" | "en";
type AgentForm = Omit<AgentConfig, "id">;
type LocalAgent = AgentConfig & {
  enabled: boolean;
  source: string;
  apiUrl: string;
  apiKey: string;
  tools: string[];
};
type WorkspaceCapability = CapabilityDefinition & { enabled: boolean };
type Copy = (typeof copy)[Language];

const LOCAL_MESSAGES_KEY = "multi-agent-workspace.local-messages.v1";
const LOCAL_KNOWLEDGE_KEY = "multi-agent-workspace.local-knowledge.v1";
const LOCAL_LANGUAGE_KEY = "multi-agent-workspace.language.v1";

const navItems: { key: PageKey; icon: typeof MessageSquareText }[] = [
  { key: "chat", icon: MessageSquareText },
  { key: "creator", icon: Bot },
  { key: "tools", icon: Boxes },
  { key: "dashboard", icon: GitBranch },
  { key: "settings", icon: Settings },
];

const copy = {
  zh: {
    nav: {
      chat: "对话空间",
      creator: "创建智能体",
      tools: "能力库",
      dashboard: "调用链路",
      settings: "基础设置",
    },
    productSubtitle: "多 Agent 工作平台",
    siderHint: "先创建 Agent，再在对话空间发送消息。当前版本优先保证本地可用。",
    topDescription: "创建 Agent，输入消息，已启用的 Agent 会在同一对话区依次回复。",
    language: "语言",
    zh: "中文",
    en: "English",
    loadedAgents: "已添加的智能体",
    enabledCount: "个启用",
    currentChat: "当前对话",
    chatTargetHint: "消息会发送给所有已启用的 Agent。",
    clearChat: "清空对话",
    inputPlaceholder: "输入消息，发送给当前启用的 Agent",
    send: "发送",
    noAgents: "还没有智能体。",
    addAgent: "添加智能体",
    noMessages: "还没有消息。",
    deleteAgent: "删除智能体",
    editAgent: "编辑智能体",
    agentEnabled: "已启用",
    agentDisabled: "已停用",
    joinReply: "参与回复",
    you: "你",
    thinking: "正在生成...",
    needName: "请先填写智能体名称。",
    needPrompt: "角色设定 Prompt 至少需要 10 个字符。",
    needAgent: "请先添加并启用至少一个智能体。你的消息已保留在对话中。",
    sanitizedKey: "部分 Agent 的 API Key 包含中文或全角字符，本次已忽略这些 Key 并继续发送。",
    savedWithSanitizedKey: "已保存 {name}，但 API Key 包含中文或全角字符，本地已忽略该 Key。",
    agentAdded: "已添加智能体：{name}",
    agentUpdated: "已更新智能体：{name}",
    editingAgent: "正在编辑智能体：{name}",
    editCancelled: "已取消编辑，可以继续创建新的智能体。",
    callFailed: "模型调用失败。",
    noStream: "没有收到流式响应。",
    sendFailed: "发送失败。",
    clearDone: "对话记录已清空。本地 Agent 配置仍然保留。",
    currentAgents: "当前智能体",
    currentAgentsDesc: "这里可以查看、编辑、启用或删除已经创建的智能体。",
    apiUrlLabel: "API URL",
    apiKeyConfigured: "已配置密钥",
    apiKeyMissing: "未配置密钥",
    capabilityNames: "能力：{names}",
    emptyAgentsInCreator: "还没有智能体。先在右侧创建一个。",
    capabilityCount: "个能力",
    createAgent: "创建智能体",
    editAgentTitle: "编辑智能体：{name}",
    createAgentDesc: "填写模型连接信息后，智能体会加入对话空间。",
    editingHint: "当前正在修改已有智能体，保存后会覆盖原配置。",
    cancelEdit: "取消编辑",
    agentName: "智能体名称",
    agentNamePlaceholder: "例如：需求分析师",
    rolePrompt: "角色设定 Prompt",
    promptPlaceholder: "描述这个智能体的职责、语气和输出要求，至少 10 个字符。",
    modelSource: "模型来源",
    modelName: "模型名称",
    apiUrlPlaceholder: "https://api.example.com/v1 或 http://localhost:11434",
    apiKeyLabel: "API Key / API 密钥",
    apiKeyPlaceholder: "请输入 API Key",
    ollamaKeyPlaceholder: "Ollama 本地模型可留空",
    capabilityBinding: "能力绑定",
    capabilityBindingDesc: "当前先作为能力开关保存，后续可接入真实 RAG、记忆、语义缓存和工具服务。",
    selectedCapabilities: "已选择 {count} 个能力",
    noneSelected: "暂未选择",
    chooseCapabilities: "选择能力",
    cancel: "取消",
    saveChanges: "保存修改",
    addToChat: "添加到对话空间",
    capabilityLibrary: "系统能力库",
    capabilityLibraryDesc: "RAG、工具调用、记忆、语义缓存建议放在平台能力层，再按 Agent 绑定。",
    localRagKnowledge: "本地 RAG 知识",
    localRagDesc: "添加本地知识片段后，绑定 RAG Retrieval 的 Agent 会在每次对话前复用这些内容做轻量检索。",
    knowledgeTitlePlaceholder: "知识标题，例如：项目定位",
    knowledgeContentPlaceholder: "粘贴一段项目说明、接口约定、业务规则或参考资料。",
    addKnowledge: "添加知识",
    emptyKnowledge: "还没有本地知识片段。添加后，RAG 能力会在聊天运行时检索它们。",
    deleteKnowledge: "删除知识片段",
    chooseCapabilityTitle: "选择能力",
    chooseCapabilityDesc: "选择这个 Agent 可以使用的平台能力。",
    done: "完成",
    sequenceTitle: "调用序列图",
    sequenceDesc: "当前 v0.1 采用顺序多 Agent 调用，先保证稳定可用。",
    sequenceSteps: ["用户输入", "筛选启用 Agent", "组装上下文", "调用模型", "接收 SSE 事件", "展示消息"],
    manualAgents: "手动智能体",
    visibleMessages: "可见消息",
    currentSpend: "当前消耗",
    countAgents: "{count} 个",
    countMessages: "{count} 条",
    settingsTitle: "基础设置",
    settingsDesc: "当前版本优先跑通本地 Web MVP。正式生产能力将在下一阶段接入。",
    apiKeyStorage: "API Key 当前只用于本地手动 Agent 调用，刷新后会保存在浏览器 localStorage。",
    futureWork: "数据库、账号系统、密钥加密持久化和桌面端打包属于下一阶段。",
    simulationMode: "未填写 API Key 时，远程模型会进入模拟回复；Ollama 可留空但调用本地服务。",
  },
  en: {
    nav: {
      chat: "Chat",
      creator: "Agents",
      tools: "Capabilities",
      dashboard: "Run Flow",
      settings: "Settings",
    },
    productSubtitle: "Multi-Agent Workspace",
    siderHint: "Create agents first, then send messages in the chat workspace. This version prioritizes local reliability.",
    topDescription: "Create agents, enter a message, and enabled agents will reply in sequence in the same chat.",
    language: "Language",
    zh: "涓中枃",
    en: "English",
    loadedAgents: "Added agents",
    enabledCount: "enabled",
    currentChat: "Current chat",
    chatTargetHint: "Messages are sent to all enabled agents.",
    clearChat: "Clear chat",
    inputPlaceholder: "Type a message for the enabled agents",
    send: "Send",
    noAgents: "No agents yet.",
    addAgent: "Add agent",
    noMessages: "No messages yet.",
    deleteAgent: "Delete agent",
    editAgent: "Edit agent",
    agentEnabled: "Enabled",
    agentDisabled: "Disabled",
    joinReply: "Join replies",
    you: "You",
    thinking: "is generating...",
    needName: "Please enter an agent name.",
    needPrompt: "The role prompt needs at least 10 characters.",
    needAgent: "Please add and enable at least one agent. Your message has been kept in the chat.",
    sanitizedKey: "Some agent API keys contained Chinese or full-width characters, so those keys were ignored for this run.",
    savedWithSanitizedKey: "Saved {name}, but the API key contained non-ByteString characters and was ignored locally.",
    agentAdded: "Agent added: {name}",
    agentUpdated: "Agent updated: {name}",
    editingAgent: "Editing agent: {name}",
    editCancelled: "Edit cancelled. You can create a new agent now.",
    callFailed: "Model call failed.",
    noStream: "No streaming response received.",
    sendFailed: "Send failed.",
    clearDone: "Chat history cleared. Local agent configuration is still kept.",
    currentAgents: "Current agents",
    currentAgentsDesc: "View, edit, enable, or delete the agents you created.",
    apiUrlLabel: "API URL",
    apiKeyConfigured: "Key configured",
    apiKeyMissing: "No key",
    capabilityNames: "Capabilities: {names}",
    emptyAgentsInCreator: "No agents yet. Create one on the right.",
    capabilityCount: "capabilities",
    createAgent: "Create agent",
    editAgentTitle: "Edit agent: {name}",
    createAgentDesc: "After model connection details are saved, the agent joins the chat workspace.",
    editingHint: "You are editing an existing agent. Saving will overwrite its configuration.",
    cancelEdit: "Cancel edit",
    agentName: "Agent name",
    agentNamePlaceholder: "Example: Product analyst",
    rolePrompt: "Role prompt",
    promptPlaceholder: "Describe the agent's responsibility, voice, and output requirements. Minimum 10 characters.",
    modelSource: "Model source",
    modelName: "Model name",
    apiUrlPlaceholder: "https://api.example.com/v1 or http://localhost:11434",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "Enter API Key",
    ollamaKeyPlaceholder: "Local Ollama can be left blank",
    capabilityBinding: "Capability binding",
    capabilityBindingDesc: "For now these are saved as capability switches. Real RAG, memory, semantic cache, and tool services can be connected later.",
    selectedCapabilities: "{count} capabilities selected",
    noneSelected: "None selected",
    chooseCapabilities: "Choose capabilities",
    cancel: "Cancel",
    saveChanges: "Save changes",
    addToChat: "Add to chat",
    capabilityLibrary: "System capability library",
    capabilityLibraryDesc: "RAG, tool calling, memory, and semantic cache should live in the platform capability layer, then be bound per agent.",
    localRagKnowledge: "Local RAG knowledge",
    localRagDesc: "After adding local snippets, agents with RAG Retrieval will reuse them through lightweight retrieval before each chat turn.",
    knowledgeTitlePlaceholder: "Knowledge title, for example: project positioning",
    knowledgeContentPlaceholder: "Paste project notes, API contracts, business rules, or reference material.",
    addKnowledge: "Add knowledge",
    emptyKnowledge: "No local knowledge snippets yet. After adding them, RAG will retrieve them during chat runs.",
    deleteKnowledge: "Delete knowledge snippet",
    chooseCapabilityTitle: "Choose capabilities",
    chooseCapabilityDesc: "Select platform capabilities this agent can use.",
    done: "Done",
    sequenceTitle: "Run sequence",
    sequenceDesc: "v0.1 uses sequential multi-agent calls so the core loop stays reliable.",
    sequenceSteps: ["User input", "Filter enabled agents", "Build context", "Call model", "Receive SSE events", "Show messages"],
    manualAgents: "Manual agents",
    visibleMessages: "Visible messages",
    currentSpend: "Current spend",
    countAgents: "{count}",
    countMessages: "{count}",
    settingsTitle: "Basic settings",
    settingsDesc: "This version prioritizes the local Web MVP. Production capabilities will be added in the next phase.",
    apiKeyStorage: "API keys are currently used only for local manual agent calls and are stored in browser localStorage after refresh.",
    futureWork: "Database, account system, encrypted key persistence, and desktop packaging belong to the next phase.",
    simulationMode: "Remote models enter simulation mode when API Key is empty; Ollama can be empty and call the local service.",
  },
} as const;

const sourceOptions = ["Ollama", "OpenAI Compatible", "DeepSeek", "Anthropic", "Custom"];
const sourceLabels: Record<string, string> = {
  Ollama: "Ollama",
  "OpenAI Compatible": "OpenAI Compatible",
  DeepSeek: "DeepSeek",
  Anthropic: "Anthropic",
  Custom: "Custom OpenAI-compatible",
};
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

function loadLocalMessages(): WorkspaceMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_MESSAGES_KEY) || "[]") as WorkspaceMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLocalKnowledge(): KnowledgeSnippet[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KNOWLEDGE_KEY) || "[]") as KnowledgeSnippet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(messages: WorkspaceMessage[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages.slice(-100)));
}


/**
 * 从数据库加载手动工作区的历史消息
 *
 * 作用：页面刷新后，从后端取回历史对话，替代之前的 localStorage 方案。
 * 原理：调用 GET /api/workspaces/manual/messages，返回按时间排序的消息列表。
 * 注意：这是异步函数，需要在 useEffect 中调用。
 */
async function loadPersistedMessages(): Promise<WorkspaceMessage[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/workspaces/manual/messages");
    if (!res.ok) throw new Error("Failed to load messages");
    const data = (await res.json()) as WorkspaceMessage[];
    return Array.isArray(data) ? data : [];
  } catch {
    // 降级到 localStorage
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LOCAL_MESSAGES_KEY) || "[]") as WorkspaceMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

/**
 * 清空手动工作区的历史消息
 *
 * 作用：用户点击"清空对话"时，同时清除数据库和本地的消息。
 * 原理：调用 DELETE /api/workspaces/manual/messages，并清空 localStorage。
 */
async function clearPersistedMessages(): Promise<void> {
  try {
    await fetch("/api/workspaces/manual/messages", { method: "DELETE" });
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_MESSAGES_KEY);
}


function saveLocalKnowledge(snippets: KnowledgeSnippet[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_KNOWLEDGE_KEY, JSON.stringify(snippets.slice(-50)));
}

function loadLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(LOCAL_LANGUAGE_KEY) === "en" ? "en" : "zh";
}

function saveLanguage(language: Language) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_LANGUAGE_KEY, language);
}

function hasNonByteStringCharacters(value: string) {
  return /[^\x00-\xff]/.test(value);
}

function sanitizeApiKey(value: string) {
  return hasNonByteStringCharacters(value) ? "" : value.trim();
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

/**
 * 鏂囨。鍒楄〃椤圭被鍨? *
 * 浣滅敤锛氭弿杩扮敤鎴蜂笂浼犵殑鏂囨。鍩烘湰淇℃伅锛堜粠 API 杩斿洖鐨勬暟鎹构粨鏋勶級
 * 鍘熺悊锛氫笌鍚庣端 /api/documents 杩斿洖鐨勫瓧娈典繚鎸佷竴鑷? */
type DocumentItem = {
  id: string;
  fileName: string;
  title: string;
  format: string;
  size: number;
  createdAt: string;
  _count?: { chunks: number };
};

export function WorkspaceApp({ initialWorkspace }: { initialWorkspace: WorkspaceSnapshot }) {
  const [activePage, setActivePage] = useState<PageKey>("chat");
  const [language, setLanguage] = useState<Language>("zh");
  const t = copy[language];
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const {
    agents: localAgents,
    loading: agentsLoading,
    error: agentsError,
    loadAgents,
    addAgent,
    updateAgent,
    removeAgent,
    toggleAgent,
  } = useAgentStore();
  const [knowledgeSnippets, setKnowledgeSnippetsState] = useState<KnowledgeSnippet[]>([]);
  const [capabilities, setCapabilities] = useState<WorkspaceCapability[]>(defaultWorkspaceCapabilities);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(getEnabledDefaultCapabilityIds());
  const [agentSource, setAgentSource] = useState("Ollama");
  const [agentApiUrl, setAgentApiUrl] = useState(sourceToApiUrl("Ollama"));
  const [agentApiKey, setAgentApiKey] = useState("");
  const [agentForm, setAgentForm] = useState<AgentForm>(() => createAgentForm("Ollama"));
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [useRag, setUseRag] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const { messages, activeAgentId, isRunning, error, totalSpent, budgetStatus, setWorkspace, applyEvent } = useWorkspaceStore();

  const visibleMessages = useMemo(() => messages.filter((message) => message.role !== "orchestrator"), [messages]);
  const enabledAgents = useMemo(() => localAgents.filter((agent) => agent.enabled), [localAgents]);

  const setLocalAgents = useCallback((updater: (agents: LocalAgent[]) => LocalAgent[]) => {
    const current = useAgentStore.getState().agents;
    const next = updater(current);
    // Determine operation type based on length comparison
    if (next.length < current.length) {
      // Deletion: find removed agents
      const removed = current.filter((a) => !next.find((n) => n.id === a.id));
      removed.forEach((a) => removeAgent(a.id));
    } else if (next.length === current.length) {
      // Toggle or edit
      for (const agent of next) {
        const old = current.find((a) => a.id === agent.id);
        if (old && old.enabled !== agent.enabled) {
          toggleAgent(agent.id);
        } else if (old) {
          const { enabled: _e, source: _s, apiUrl: _u, apiKey: _k, tools: _t, ...patch } = agent;
          updateAgent(agent.id, patch);
        }
      }
    }
  }, [removeAgent, toggleAgent, updateAgent]);

  const setKnowledgeSnippets = useCallback((updater: (snippets: KnowledgeSnippet[]) => KnowledgeSnippet[]) => {
    setKnowledgeSnippetsState((current) => {
      const next = updater(current);
      saveLocalKnowledge(next);
      return next;
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setLanguage(loadLanguage());
      loadAgents();
      setKnowledgeSnippetsState(loadLocalKnowledge());
    });
    // Load messages from database asynchronously
    loadPersistedMessages().then((messages) => {
      setWorkspace({ ...initialWorkspace, agents: [], messages, totalSpent: 0, status: "idle" });
    });
  }, [initialWorkspace, setWorkspace, loadAgents]);

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  useEffect(() => {
    // Messages are persisted via the manual/run API, no need to duplicate to localStorage
  }, [visibleMessages]);

  /**
   * 鍒囨崲鍒板伐鍏烽〉闈㈡椂鑷个姩鍔犺浇鏂囨。鍒楄〃
   *
   * 浣滅敤锛氱敤鎴疯繘鍏?鑳藉姏搴?椤甸潰鏃讹紝鑷个姩浠庡悗绔见幏鍙栧凡涓婁紶鐨勬枃妗?   * 鍘熺悊锛氱洃鍚?activePage 鍙樺寲锛屽綋 page 涓?"tools" 鏃惰皟鐢?loadDocuments()
   */
  useEffect(() => {
    if (activePage === "tools") {
      loadDocuments();
    }
  }, [activePage]);

  /**
   * 鍔犺浇鏂囨。鍒楄〃
   *
   * 浣滅敤锛氫粠鍚庣端鑾峰彇褰撳墠鐢ㄦ埛涓婁紶鐨勬墍鏈夋枃妗?   * 鍘熺悊锛氳皟鐢?/api/documents GET 鎺ュ彛锛岃繑鍥炴枃妗ｅ熀鏈优俊鎭已垪琛?   * 濡備綍璋冪敤锛歛wait loadDocuments();
   */
  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data as DocumentItem[]);
      }
    } catch {
      // ignore
    }
  }

  async function uploadDocument(file: File) {
    setDocumentUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        await loadDocuments();
      }
    } finally {
      setDocumentUploading(false);
    }
  }

  /**
   * 鍒犻櫎鏂囨。
   *
   * 浣滅敤锛氫粠鐭ヨ瘑搴撲腑绉婚櫎鎸囧畾鏂囨。鍙婂叾鎵€鏈夌煡璇嗗潡
   * 鍘熺悊锛氳皟鐢?/api/documents/[id] DELETE 鎺ュ彛
   * 鍙傛暟涓庤繑鍥炲€硷細
   *   - id: 鏂囨。 ID
   * 濡備綍璋冪敤锛歛wait deleteDocument('abc123');
   */
  async function deleteDocument(id: string) {
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((docs) => docs.filter((doc) => doc.id !== id));
    } catch {
      // 鍒犻櫎澶辫触闈欓粯澶勭悊
    }
  }

  function syncAgentSource(source: string) {
    setAgentSource(source);
    setAgentApiUrl(sourceToApiUrl(source));
    setAgentForm((current) => ({ ...current, provider: sourceToProvider(source), model: defaultModelForSource(source) }));
  }

  function addLocalAgent() {
    const name = agentForm.name.trim();
    const systemPrompt = agentForm.systemPrompt.trim();
    if (!name) return setNotice(t.needName);
    if (systemPrompt.length < 10) return setNotice(t.needPrompt);

    const apiKeyWasSanitized = hasNonByteStringCharacters(agentApiKey);
    const next: LocalAgent = {
      ...agentForm,
      id: editingAgentId ?? `local-${Date.now()}`,
      name,
      systemPrompt,
      avatar: name.slice(0, 2).toUpperCase(),
      provider: sourceToProvider(agentSource),
      enabled: localAgents.find((agent) => agent.id === editingAgentId)?.enabled ?? true,
      source: agentSource,
      apiUrl: agentApiUrl.trim(),
      apiKey: sanitizeApiKey(agentApiKey),
      tools: selectedToolIds,
      capabilityIds: selectedToolIds,
    };
    setLocalAgents((items) => (editingAgentId ? items.map((item) => (item.id === editingAgentId ? next : item)) : [...items, next]));
    setNotice(apiKeyWasSanitized ? interpolate(t.savedWithSanitizedKey, { name: next.name }) : interpolate(editingAgentId ? t.agentUpdated : t.agentAdded, { name: next.name }));
    setEditingAgentId(null);
    setAgentForm(createAgentForm(agentSource));
    setAgentApiKey("");
  }

  function editLocalAgent(agent: LocalAgent) {
    setEditingAgentId(agent.id);
    setAgentSource(agent.source);
    setAgentApiUrl(agent.apiUrl);
    setAgentApiKey(agent.apiKey);
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
    setNotice(interpolate(t.editingAgent, { name: agent.name }));
  }

  function cancelAgentEdit() {
    setEditingAgentId(null);
    setAgentForm(createAgentForm(agentSource));
    setAgentApiKey("");
    setSelectedToolIds(getEnabledDefaultCapabilityIds());
    setNotice(t.editCancelled);
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isRunning) return;

    const userMessage: WorkspaceMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    applyEvent({ type: "user_message_created", message: userMessage });
    setInput("");

    if (enabledAgents.length === 0) {
      setNotice(t.needAgent);
      return;
    }

    const runnableAgents = enabledAgents.map((agent) => ({ ...agent, apiKey: sanitizeApiKey(agent.apiKey) }));
    const hasSanitizedKey = runnableAgents.some((agent, index) => agent.apiKey !== enabledAgents[index]?.apiKey);
    setNotice(hasSanitizedKey ? t.sanitizedKey : null);

    try {
      const response = await fetch("/api/workspaces/manual/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt, agents: runnableAgents, useRag, knowledgeSnippets }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error || t.callFailed);
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
          if (runEvent.type !== "user_message_created") applyEvent(runEvent);
        }
      }
    } catch (runError) {
      const fallbackAgent = runnableAgents[0];
      if (fallbackAgent) {
        applyEvent({ type: "agent_started", agent: fallbackAgent });
        applyEvent({
          type: "agent_completed",
          agent: fallbackAgent,
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            agentId: fallbackAgent.id,
            content: language === "zh" ? `我看到你的输入: ${prompt}\\n\\n但这次模型调用没有成功: ${runError instanceof Error ? runError.message : t.sendFailed}` : `I saw your input: ${prompt}\\n\\nBut the model call did not succeed: ${runError instanceof Error ? runError.message : t.sendFailed}`,
            createdAt: new Date().toISOString(),
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          },
          totalSpent,
          budgetStatus,
        });
      }
      applyEvent({ type: "run_completed", totalSpent, budgetStatus });
      setNotice(runError instanceof Error ? runError.message : t.sendFailed);
    }
  }

  function clearChat() {
    setWorkspace({ ...initialWorkspace, agents: [], messages: [], totalSpent: 0, status: "idle" });
    saveLocalMessages([]);
    setNotice(t.clearDone);
  }

  const content = {
    chat: (
      <ChatWorkspace
        t={t}
        agents={localAgents}
        enabledCount={enabledAgents.length}
        setAgents={setLocalAgents}
        messages={visibleMessages}
        activeAgentId={activeAgentId}
        isRunning={isRunning}
        error={error}
        input={input}
        setInput={setInput}
        onRun={handleRun}
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
        apiKey={agentApiKey}
        setApiKey={setAgentApiKey}
        selectedToolIds={selectedToolIds}
        tools={capabilities}
        setAgents={setLocalAgents}
        onEditAgent={editLocalAgent}
        onCancelEdit={cancelAgentEdit}
        setToolPickerOpen={setToolPickerOpen}
        onSubmit={(event) => {
          event.preventDefault();
          addLocalAgent();
        }}
      />
    ),
    tools: <ToolLibrary t={t} tools={capabilities} setTools={setCapabilities} knowledgeSnippets={knowledgeSnippets} setKnowledgeSnippets={setKnowledgeSnippets} />,
    dashboard: <SequenceDashboard t={t} agents={localAgents} messages={visibleMessages} totalSpent={totalSpent} budgetStatus={budgetStatus} />,
    settings: <SystemSettings t={t} />,
  } satisfies Record<PageKey, ReactNode>;

  return (
    <div className="flex h-screen min-h-[760px] bg-[#F7F8FA] text-slate-800">
      <GlobalSider t={t} activePage={activePage} setActivePage={setActivePage} />
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <TopBar t={t} activePage={activePage} notice={notice} language={language} setLanguage={setLanguage} />
        {content[activePage]}
      </main>
      {toolPickerOpen && <ToolPicker t={t} tools={capabilities} selectedToolIds={selectedToolIds} setSelectedToolIds={setSelectedToolIds} onClose={() => setToolPickerOpen(false)} />}
    </div>
  );
}

function GlobalSider({ t, activePage, setActivePage }: { t: Copy; activePage: PageKey; setActivePage: (page: PageKey) => void }) {
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

function TopBar({ t, activePage, notice, language, setLanguage }: { t: Copy; activePage: PageKey; notice: string | null; language: Language; setLanguage: (language: Language) => void }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">{t.nav[activePage]}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.topDescription}</p>
      </div>
      <div className="flex items-center gap-3">
        {notice && <div className="max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">{notice}</div>}
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

function ChatWorkspace(props: {
  t: Copy;
  agents: LocalAgent[];
  enabledCount: number;
  setAgents: (updater: (agents: LocalAgent[]) => LocalAgent[]) => void;
  messages: WorkspaceMessage[];
  activeAgentId: string | null;
  isRunning: boolean;
  error: string | null;
  input: string;
  setInput: (value: string) => void;
  onRun: (event: FormEvent<HTMLFormElement>) => void;
  onAddAgent: () => void;
  onClearChat: () => void;
}) {
  return (
    <section className="flex h-[calc(100vh-132px)] min-h-[620px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-[#FAFBFC] p-3 max-lg:w-[72px]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 max-lg:hidden">
            <div className="text-sm font-semibold">{props.t.loadedAgents}</div>
            <div className="text-xs text-slate-500">
              {props.enabledCount} {props.t.enabledCount}
            </div>
          </div>
          <button type="button" onClick={props.onAddAgent} className="icon-button" aria-label={props.t.addAgent}>
            <Plus />
          </button>
        </div>
        <AgentList t={props.t} agents={props.agents} setAgents={props.setAgents} onAddAgent={props.onAddAgent} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-[#F7F8FA]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">{props.t.currentChat}</div>
            <div className="text-xs text-slate-500">{props.t.chatTargetHint}</div>
          </div>
          <button type="button" onClick={props.onClearChat} className="secondary-button h-9 px-3">
            {props.t.clearChat}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {props.messages.length === 0 && <EmptyChat t={props.t} onAddAgent={props.onAddAgent} />}
            {props.messages.map((message) => (
              <MessageBubble key={message.id} t={props.t} message={message} agent={props.agents.find((agent) => agent.id === message.agentId)} />
            ))}
            {props.activeAgentId && <ThinkingBubble t={props.t} agent={props.agents.find((agent) => agent.id === props.activeAgentId)} />}
          </div>
        </div>
        <form onSubmit={props.onRun} className="border-t border-slate-200 bg-white p-4">
          {props.error && <div className="mx-auto mb-3 max-w-4xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{props.error}</div>}
          <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <textarea
              className="min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
              rows={1}
              value={props.input}
              onChange={(event) => props.setInput(event.target.value)}
              placeholder={props.t.inputPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" disabled={!props.input.trim() || props.isRunning} className="primary-button h-10 px-4">
              {props.isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              {props.t.send}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function AgentList({ t, agents, setAgents, onAddAgent }: { t: Copy; agents: LocalAgent[]; setAgents: (updater: (agents: LocalAgent[]) => LocalAgent[]) => void; onAddAgent: () => void }) {
  if (agents.length === 0) {
    return (
      <button type="button" onClick={onAddAgent} className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500 max-lg:p-2">
        <Bot className="h-5 w-5 text-[#5B5BD6]" />
        <span className="max-lg:hidden">{t.noAgents}</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div key={agent.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm max-lg:p-2">
          <div className="flex items-start gap-3">
            <Avatar agent={agent} />
            <div className="min-w-0 flex-1 max-lg:hidden">
              <div className="truncate text-sm font-medium text-slate-900">{agent.name}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {agent.source} / {agent.model}
              </div>
            </div>
            <button type="button" onClick={() => setAgents((items) => items.filter((item) => item.id !== agent.id))} className="text-slate-400 hover:text-red-500 max-lg:hidden" aria-label={t.deleteAgent}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between max-lg:hidden">
            <span className={cn("text-[11px]", agent.enabled ? "text-emerald-600" : "text-slate-400")}>{agent.enabled ? t.agentEnabled : t.agentDisabled}</span>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <span>{t.joinReply}</span>
              <input type="checkbox" checked={agent.enabled} onChange={(event) => setAgents((items) => items.map((item) => (item.id === agent.id ? { ...item, enabled: event.target.checked } : item)))} />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChat({ t, onAddAgent }: { t: Copy; onAddAgent: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[#5B5BD6]">
        <Bot className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-slate-500">{t.noMessages}</p>
      <button type="button" onClick={onAddAgent} className="secondary-button mx-auto mt-4 h-9 px-3">
        <Plus className="h-4 w-4" />
        {t.addAgent}
      </button>
    </div>
  );
}

function AgentCreator(props: {
  t: Copy;
  agents: LocalAgent[];
  editingAgentId: string | null;
  form: AgentForm;
  setForm: (form: AgentForm) => void;
  source: string;
  setSource: (source: string) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  selectedToolIds: string[];
  tools: WorkspaceCapability[];
  setAgents: (updater: (agents: LocalAgent[]) => LocalAgent[]) => void;
  onEditAgent: (agent: LocalAgent) => void;
  onCancelEdit: () => void;
  setToolPickerOpen: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedTools = props.tools.filter((tool) => props.selectedToolIds.includes(tool.id));
  const editingAgent = props.agents.find((agent) => agent.id === props.editingAgentId);
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
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {agent.source} / {agent.model}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {props.t.apiUrlLabel}: {agent.apiUrl || "-"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={cn("rounded px-1.5 py-0.5 font-medium", agent.apiKey ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                      {agent.apiKey ? props.t.apiKeyConfigured : props.t.apiKeyMissing}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {interpolate(props.t.capabilityNames, { names: (agent.capabilityIds ?? agent.tools ?? []).map((id) => props.tools.find((tool) => tool.id === id)?.name).filter(Boolean).join(", ") || props.t.noneSelected })}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={agent.enabled} onChange={(event) => props.setAgents((items) => items.map((item) => (item.id === agent.id ? { ...item, enabled: event.target.checked } : item)))} />
                  {props.t.joinReply}
                </label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => props.onEditAgent(agent)} className="icon-button" aria-label={props.t.editAgent}>
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      props.setAgents((items) => items.filter((item) => item.id !== agent.id));
                      if (props.editingAgentId === agent.id) props.onCancelEdit();
                    }}
                    className="icon-button text-red-500"
                    aria-label={props.t.deleteAgent}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <form onSubmit={props.onSubmit} className="space-y-5">
        <Panel title={editingAgent ? interpolate(props.t.editAgentTitle, { name: editingAgent.name }) : props.t.createAgent} desc={props.t.createAgentDesc}>
          {editingAgent && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-[#5B5BD6]">
              <span>{props.t.editingHint}</span>
              <button type="button" onClick={props.onCancelEdit} className="secondary-button h-8 px-2">
                <X className="h-4 w-4" />
                {props.t.cancelEdit}
              </button>
            </div>
          )}
          <Field label={props.t.agentName}>
            <input className="field" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} placeholder={props.t.agentNamePlaceholder} />
          </Field>
          <Field label={props.t.rolePrompt}>
            <textarea className="field min-h-32" value={props.form.systemPrompt} onChange={(event) => props.setForm({ ...props.form, systemPrompt: event.target.value })} placeholder={props.t.promptPlaceholder} />
          </Field>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field label={props.t.modelSource}>
              <select className="field" value={props.source} onChange={(event) => props.setSource(event.target.value)}>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>{sourceLabels[source]}</option>
                ))}
              </select>
            </Field>
            <Field label={props.t.modelName}>
              <input className="field" value={props.form.model} onChange={(event) => props.setForm({ ...props.form, model: event.target.value })} placeholder="llama3.1 / gpt-4o-mini / deepseek-chat" />
            </Field>
          </div>
          <Field label="API URL">
            <input className="field" value={props.apiUrl} onChange={(event) => props.setApiUrl(event.target.value)} placeholder={props.t.apiUrlPlaceholder} />
          </Field>
          <Field label={props.t.apiKeyLabel}>
            <input className="field" type="password" value={props.apiKey} onChange={(event) => props.setApiKey(event.target.value)} placeholder={props.source === "Ollama" ? props.t.ollamaKeyPlaceholder : props.t.apiKeyPlaceholder} />
          </Field>
        </Panel>
        <Panel title={props.t.capabilityBinding} desc={props.t.capabilityBindingDesc}>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <div className="text-sm font-medium text-slate-800">{interpolate(props.t.selectedCapabilities, { count: selectedTools.length })}</div>
              <div className="mt-1 text-xs text-slate-500">{selectedTools.map((tool) => tool.name).join(", ") || props.t.noneSelected}</div>
            </div>
            <button type="button" onClick={() => props.setToolPickerOpen(true)} className="secondary-button h-9 px-3">
              <Search className="h-4 w-4" />
              {props.t.chooseCapabilities}
            </button>
          </div>
        </Panel>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-[#F7F8FA]/95 py-4">
          {editingAgent && (
            <button type="button" onClick={props.onCancelEdit} className="secondary-button h-10 px-4">
              {props.t.cancel}
            </button>
          )}
          <button type="submit" className="primary-button h-10 px-4">
            <Save className="h-4 w-4" />
            {editingAgent ? props.t.saveChanges : props.t.addToChat}
          </button>
        </div>
      </form>
    </div>
  );
}

function ToolLibrary({ t, tools, setTools, knowledgeSnippets, setKnowledgeSnippets }: { t: Copy; tools: WorkspaceCapability[]; setTools: (tools: WorkspaceCapability[]) => void; knowledgeSnippets: KnowledgeSnippet[]; setKnowledgeSnippets: (updater: (snippets: KnowledgeSnippet[]) => KnowledgeSnippet[]) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function addSnippet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) return;

    setKnowledgeSnippets((snippets) => [
      {
        id: crypto.randomUUID(),
        title: nextTitle,
        content: nextContent,
        createdAt: new Date().toISOString(),
      },
      ...snippets,
    ]);
    setTitle("");
    setContent("");
  }

  return (
    <div className="space-y-5">
      <Panel title={t.capabilityLibrary} desc={t.capabilityLibraryDesc}>
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
          {tools.map((tool) => (
            <div key={tool.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{tool.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{tool.kind}</div>
                </div>
                <input type="checkbox" checked={tool.enabled} onChange={(event) => setTools(tools.map((item) => (item.id === tool.id ? { ...item, enabled: event.target.checked } : item)))} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{tool.description}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={t.localRagKnowledge} desc={t.localRagDesc}>
        <form onSubmit={addSnippet} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.knowledgeTitlePlaceholder} />
          <textarea className="field min-h-28" value={content} onChange={(event) => setContent(event.target.value)} placeholder={t.knowledgeContentPlaceholder} />
          <div className="flex justify-end">
            <button type="submit" disabled={!title.trim() || !content.trim()} className="primary-button h-9 px-3">
              <Plus className="h-4 w-4" />
              {t.addKnowledge}
            </button>
          </div>
        </form>
        <div className="mt-4 grid gap-3">
          {knowledgeSnippets.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{t.emptyKnowledge}</div>}
          {knowledgeSnippets.map((snippet) => (
            <div key={snippet.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{snippet.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{new Date(snippet.createdAt).toLocaleString()}</div>
                </div>
                <button type="button" onClick={() => setKnowledgeSnippets((snippets) => snippets.filter((item) => item.id !== snippet.id))} className="icon-button text-red-500" aria-label={t.deleteKnowledge}>
                  <Trash2 />
                </button>
              </div>
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-500">{snippet.content}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ToolPicker({ t, tools, selectedToolIds, setSelectedToolIds, onClose }: { t: Copy; tools: WorkspaceCapability[]; selectedToolIds: string[]; setSelectedToolIds: (ids: string[]) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-6">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{t.chooseCapabilityTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.chooseCapabilityDesc}</p>
          </div>
          <button type="button" className="secondary-button h-9 px-3" onClick={onClose}>
            {t.done}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {tools
            .filter((tool) => tool.enabled)
            .map((tool) => {
              const checked = selectedToolIds.includes(tool.id);
              return (
                <button key={tool.id} type="button" onClick={() => setSelectedToolIds(checked ? selectedToolIds.filter((id) => id !== tool.id) : [...selectedToolIds, tool.id])} className={cn("rounded-lg border p-4 text-left transition", checked ? "border-[#5B5BD6] bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{tool.name}</span>
                    {checked && <Check className="h-4 w-4 text-[#5B5BD6]" />}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{tool.description}</p>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function SequenceDashboard({ t, agents, messages, totalSpent, budgetStatus }: { t: Copy; agents: LocalAgent[]; messages: WorkspaceMessage[]; totalSpent: number; budgetStatus: string }) {
  type DashboardData = {
    agentCount: number;
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    byProvider: { provider: string; count: number }[];
  };

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/dashboard/stats");
        if (!response.ok) throw new Error("fetch failed");
        const data: DashboardData = await response.json();
        if (!cancelled) {
          setDashboardData(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <Panel title={t.sequenceTitle} desc={t.sequenceDesc}>
        <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
          {t.sequenceSteps.map((step, index) => (
            <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm">
              <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#5B5BD6] shadow-sm">{index + 1}</div>
              {step}
            </div>
          ))}
        </div>
      </Panel>

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">???...</div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-center text-sm text-red-500 shadow-sm">????????</div>
      )}

      {dashboardData && !loading && (
        <>
          <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
            <InfoBlock label="Agent ??" value={String(dashboardData.agentCount ?? 0)} />
            <InfoBlock label="????" value={String(dashboardData.messageCount ?? 0)} />
            <InfoBlock label="?????" value={String(dashboardData.userMessages ?? 0)} />
            <InfoBlock label="AI ???" value={String(dashboardData.assistantMessages ?? 0)} />
          </div>
          <Panel title="Provider ??" desc="?? provider ? Agent ??">
            <div className="grid gap-2">
              {dashboardData.byProvider.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">?? Provider ??</div>
              )}
              {dashboardData.byProvider.map((item) => (
                <div key={item.provider} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-700">{item.provider}</span>
                  <span className="text-slate-500">{item.count} ? Agent</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}


function SystemSettings({ t }: { t: Copy }) {
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; provider: string; maskedKey: string; isValid: boolean }>>([]);
  const [newProvider, setNewProvider] = useState<string>("openai");
  const [newApiKey, setNewApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/api-keys");
        if (response.ok && !cancelled) {
          const data = await response.json();
          setApiKeys(data);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchApiKeys() {
    try {
      const response = await fetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch {
      // ignore
    }
  }

  async function addApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newApiKey.trim() || newApiKey.trim().length < 8) return;
    setLoading(true);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider, apiKey: newApiKey.trim() }),
      });
      if (response.ok) {
        setNewApiKey("");
        await fetchApiKeys();
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteApiKey(id: string) {
    try {
      await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      setApiKeys((keys) => keys.filter((key) => key.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-5">
      <Panel title={t.settingsTitle} desc={t.settingsDesc}>
        <div className="grid gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {t.futureWork}
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            {t.simulationMode}
          </div>
        </div>
      </Panel>
      <Panel title="API Key Management" desc="Store encrypted API keys for different providers. Keys are encrypted before saving to the database.">
        <form onSubmit={addApiKey} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-[160px_1fr] gap-3 max-md:grid-cols-1">
            <select className="field" value={newProvider} onChange={(event) => setNewProvider(event.target.value)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
              <option value="ollama">Ollama</option>
              <option value="custom">Custom</option>
            </select>
            <input className="field" type="password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} placeholder="Enter API Key - min 8 chars" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={loading || !newApiKey.trim() || newApiKey.trim().length < 8} className="primary-button h-9 px-3">
              <KeyRound className="h-4 w-4" />
              Add API Key
            </button>
          </div>
        </form>
        <div className="mt-4 grid gap-2">
          {apiKeys.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No API keys stored yet.</div>}
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{key.provider}</div>
                <div className="text-xs text-slate-500">{key.maskedKey}</div>
              </div>
              <button type="button" onClick={() => deleteApiKey(key.id)} className="icon-button text-red-500" aria-label="Delete API key">
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MessageBubble({ t, message, agent }: { t: Copy; message: WorkspaceMessage; agent?: AgentConfig }) {
  const isUser = message.role === "user";
  const isFailed = !isUser && message.failed;
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[76%] rounded-lg border p-4 text-sm leading-6", isUser ? "border-slate-200 bg-slate-100" : isFailed ? "border-red-200 bg-red-50 shadow-sm" : "border-slate-200 bg-white shadow-sm")}>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          {!isUser && agent && <Avatar agent={agent} small />}
          <span>{isUser ? t.you : agent?.name ?? "AI"}</span>
          {isFailed && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">{t.callFailed}</span>}
        </div>
        <p className="whitespace-pre-wrap text-slate-700">{message.content}</p>
      </div>
    </div>
  );
}

function ThinkingBubble({ t, agent }: { t: Copy; agent?: AgentConfig }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg border border-indigo-100 bg-white p-4 text-sm text-[#5B5BD6] shadow-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {agent?.name ?? "AI"} {t.thinking}
        </div>
      </div>
    </div>
  );
}

function Avatar({ agent, small = false }: { agent: Pick<AgentConfig, "avatar" | "color">; small?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white", small ? "h-6 w-6" : "h-9 w-9")} style={{ backgroundColor: agent.color }}>
      {agent.avatar}
    </div>
  );
}

function Panel({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}






