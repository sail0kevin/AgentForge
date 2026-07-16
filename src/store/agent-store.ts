"use client";

import { create } from "zustand";
import type { AgentConfig, Provider } from "@/lib/types";

export type LocalAgent = AgentConfig & {
  enabled: boolean;
  source: string;
  apiUrl: string;
  credentialConfigured: boolean;
  maskedKey: string | null;
  keyLength: number | null;
  tools: string[];
};

// apiKey 只在提交请求的这一刻存在，绝不放进 LocalAgent 或 Zustand 状态。
type AgentSubmission = Omit<LocalAgent, "id"> & { apiKey?: string };

type AgentRecord = {
  id: string; name: string; avatar: string; color: string; provider: string; model: string;
  systemPrompt: string; temperature: number; maxTokens: number; capabilityIds?: string[]; apiUrl?: string;
  credentialConfigured?: boolean; maskedKey?: string | null; keyLength?: number | null;
};

type AgentStore = {
  agents: LocalAgent[];
  loading: boolean;
  error: string | null;
  loadAgents: () => Promise<void>;
  addAgent: (agent: AgentSubmission) => Promise<LocalAgent>;
  updateAgent: (id: string, patch: Partial<AgentSubmission>) => Promise<LocalAgent>;
  removeAgent: (id: string) => Promise<boolean>;
  toggleAgent: (id: string) => void;
  clearSession: () => void;
};

function providerToSource(provider: string): string {
  const map: Record<string, string> = { ollama: "Ollama", openai: "OpenAI Compatible", deepseek: "DeepSeek", anthropic: "Anthropic", custom: "Custom" };
  return map[provider] ?? "Ollama";
}

function sourceToApiUrl(source: string): string {
  if (source === "Ollama") return "http://localhost:11434";
  if (source === "DeepSeek") return "https://api.deepseek.com";
  if (source === "Anthropic") return "https://api.anthropic.com";
  if (source === "OpenAI Compatible") return "https://api.openai.com/v1";
  return "";
}

function toLocalAgent(record: AgentRecord): LocalAgent {
  const source = providerToSource(record.provider);
  return {
    id: record.id, name: record.name, avatar: record.avatar, color: record.color,
    provider: record.provider as Provider, model: record.model, systemPrompt: record.systemPrompt,
    temperature: record.temperature, maxTokens: record.maxTokens, capabilityIds: record.capabilityIds ?? [],
    enabled: true, source, apiUrl: record.apiUrl || sourceToApiUrl(source),
    credentialConfigured: Boolean(record.credentialConfigured), maskedKey: record.maskedKey ?? null, keyLength: record.keyLength ?? null, tools: [],
  };
}

/** 浏览器端 Agent store 仅保存非敏感配置和掩码状态，绝不保留原始 API Key。 */
let loadGeneration = 0;

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [], loading: false, error: null,

  async loadAgents() {
    const generation = ++loadGeneration;
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/agents");
      if (!response.ok) throw new Error("加载智能体失败");
      if (generation !== loadGeneration) return;
      set({ agents: (await response.json() as AgentRecord[]).map(toLocalAgent), loading: false });
    } catch (error) {
      if (generation !== loadGeneration) return;
      set({ loading: false, error: error instanceof Error ? error.message : "加载智能体失败" });
    }
  },

  async addAgent(input) {
    try {
      const response = await fetch("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // 仅将临时变量 apiKey 发给服务端；响应和本地 Agent 都不会保存它。
        body: JSON.stringify({
          name: input.name, avatar: input.avatar, color: input.color, provider: input.provider,
          model: input.model, systemPrompt: input.systemPrompt, temperature: input.temperature,
          maxTokens: input.maxTokens, apiUrl: input.apiUrl || sourceToApiUrl(input.source), capabilityIds: input.capabilityIds ?? [],
          apiKey: input.apiKey?.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "创建智能体失败");
      const agent = { ...toLocalAgent(await response.json() as AgentRecord), enabled: true, tools: input.tools ?? [] };
      set((state) => ({ agents: [...state.agents, agent], error: null }));
      return agent;
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建智能体失败";
      set({ error: message });
      throw new Error(message);
    }
  },

  async updateAgent(id, patch) {
    try {
      const safePatch = {
        name: patch.name,
        avatar: patch.avatar,
        color: patch.color,
        provider: patch.provider,
        model: patch.model,
        systemPrompt: patch.systemPrompt,
        temperature: patch.temperature,
        maxTokens: patch.maxTokens,
        capabilityIds: patch.capabilityIds,
        apiUrl: patch.apiUrl,
        // 空字符串代表“保持现有密钥”，因此不发送给服务端。
        apiKey: patch.apiKey?.trim() || undefined,
      };
      const response = await fetch(`/api/agents/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safePatch) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "更新智能体失败");
      const updated = toLocalAgent(await response.json() as AgentRecord);
      set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...updated, enabled: agent.enabled, tools: patch.tools ?? agent.tools } : agent), error: null }));
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新智能体失败";
      set({ error: message });
      throw new Error(message);
    }
  },

  async removeAgent(id) {
    try {
      const response = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(detail?.error ?? "删除智能体失败");
      }
      set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id), error: null }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除智能体失败";
      set({ error: message });
      throw new Error(message);
    }
  },

  toggleAgent(id) {
    set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...agent, enabled: !agent.enabled } : agent) }));
  },

  clearSession() {
    loadGeneration += 1;
    set({ agents: [], loading: false, error: null });
  },
}));
