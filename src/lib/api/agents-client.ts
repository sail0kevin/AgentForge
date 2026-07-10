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

export async function createAgent(data: Omit<PersistedAgent, "id">): Promise<PersistedAgent> {
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

export async function updateAgent(id: string, data: Partial<PersistedAgent>): Promise<PersistedAgent> {
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

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("agent-delete-failed");
}