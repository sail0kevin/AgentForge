/**
 * Agent API client - talks to the database-backed agent CRUD endpoints.
 * Replaces the old localStorage-based agent persistence.
 */
export interface PersistedAgent {
  id: string;
  name: string;
  avatar: string;
  color: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilityIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export async function listAgents(): Promise<PersistedAgent[]> {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error("agent-list-failed");
  return res.json();
}

export interface AgentSubmission extends Omit<PersistedAgent, "id"> {
  // 原始 Key 仅用于本次 API 请求，调用方不得将它写入浏览器持久状态。
  apiKey?: string;
}

export async function createAgent(data: AgentSubmission): Promise<PersistedAgent> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "agent-create-failed");
  }
  return res.json();
}

export async function updateAgent(id: string, data: Partial<AgentSubmission>): Promise<PersistedAgent> {
  const res = await fetch(`/api/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "agent-update-failed");
  }
  return res.json();
}

export async function deleteAgent(id: string): Promise<boolean> {
  const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "agent-delete-failed");
  }
  return true;
}