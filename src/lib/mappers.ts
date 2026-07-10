import type { AgentConfig, MessageRole, Provider, WorkspaceMessage, WorkspaceMode, WorkspaceSnapshot, WorkspaceStatus } from "@/lib/types";

type AgentRecord = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

type MessageRecord = {
  id: string;
  role: string;
  agentId: string | null;
  content: string;
  createdAt: Date;
  failed?: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
};

type WorkspaceRecord = {
  id: string;
  name: string;
  description: string | null;
  mode: string;
  budgetLimit: number;
  totalSpent: number;
  status: string;
  agents: Array<{ agent: AgentRecord; sortOrder: number; isActive: boolean }>;
  messages: MessageRecord[];
};

export function mapAgent(agent: AgentRecord): AgentConfig {
  return {
    id: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    color: agent.color,
    provider: agent.provider as Provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };
}

export function mapMessage(message: MessageRecord): WorkspaceMessage {
  return {
    id: message.id,
    role: message.role as MessageRole,
    agentId: message.agentId ?? undefined,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    failed: message.failed,
    inputTokens: message.tokenUsage?.inputTokens,
    outputTokens: message.tokenUsage?.outputTokens,
    costUsd: message.tokenUsage ? message.tokenUsage.costUsd : undefined,
  };
}

export function mapWorkspace(workspace: WorkspaceRecord): WorkspaceSnapshot {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description ?? "",
    mode: workspace.mode as WorkspaceMode,
    budgetLimit: workspace.budgetLimit,
    totalSpent: workspace.totalSpent,
    status: workspace.status as WorkspaceStatus,
    agents: workspace.agents
      .filter((item) => item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => mapAgent(item.agent)),
    messages: workspace.messages.map(mapMessage),
  };
}








