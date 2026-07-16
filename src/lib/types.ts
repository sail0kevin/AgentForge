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
  implementationStatus: "available" | "planned";
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
  runId?: string;
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
  | { version?: 1; type: "run_created"; runId: string; startedAt: string }
  | { version?: 1; type: "workspace_loaded"; runId?: string; workspace: WorkspaceSnapshot }
  | { version?: 1; type: "user_message_created"; runId?: string; message: WorkspaceMessage }
  | { version?: 1; type: "agent_started"; runId?: string; agent: AgentConfig }
  | { version?: 1; type: "agent_completed"; runId?: string; agent: AgentConfig; message: WorkspaceMessage; totalSpent: number; budgetStatus: WorkspaceStatus }
  | { version?: 1; type: "agent_failed"; runId?: string; agent: AgentConfig; message: WorkspaceMessage; error: string; totalSpent: number; budgetStatus: WorkspaceStatus }
  | { version?: 1; type: "budget_exhausted"; runId?: string; totalSpent: number; budgetLimit: number }
  | { version?: 1; type: "run_completed"; runId?: string; totalSpent: number; budgetStatus: WorkspaceStatus; errorCode?: string; finishedAt?: string }
  | { version?: 1; type: "error"; runId?: string; message: string; code?: string };
