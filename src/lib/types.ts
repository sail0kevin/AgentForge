export type Provider = "openai" | "anthropic" | "deepseek" | "ollama" | "custom";
export type WorkspaceMode = "sequential" | "debate";
export type WorkspaceStatus = "idle" | "running" | "warning" | "exhausted";
export type MessageRole = "user" | "assistant" | "orchestrator";
export type CapabilityKind = "retrieval" | "memory" | "tool" | "cache" | "context";

export type CapabilityDefinition = {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  enabledByDefault: boolean;
};

export type KnowledgeSnippet = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

export type AgentConfig = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilityIds?: string[];
};

export type WorkspaceMessage = {
  id: string;
  role: MessageRole;
  agentId?: string;
  content: string;
  createdAt: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  failed?: boolean;
};

export type WorkspaceSnapshot = {
  id: string;
  name: string;
  description: string;
  mode: WorkspaceMode;
  budgetLimit: number;
  totalSpent: number;
  status: WorkspaceStatus;
  agents: AgentConfig[];
  messages: WorkspaceMessage[];
};

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
};

export type RunEvent =
  | { type: "workspace_loaded"; workspace: WorkspaceSnapshot }
  | { type: "user_message_created"; message: WorkspaceMessage }
  | { type: "agent_started"; agent: AgentConfig }
  | { type: "agent_completed"; agent: AgentConfig; message: WorkspaceMessage; totalSpent: number; budgetStatus: WorkspaceStatus }
  | { type: "agent_failed"; agent: AgentConfig; message: WorkspaceMessage; error: string; totalSpent: number; budgetStatus: WorkspaceStatus }
  | { type: "budget_exhausted"; totalSpent: number; budgetLimit: number }
  | { type: "run_completed"; totalSpent: number; budgetStatus: WorkspaceStatus }
  | { type: "error"; message: string };
