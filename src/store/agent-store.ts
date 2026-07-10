/**
 * Agent 状态管理 Store（数据库持久化版）
 *
 * 作用：通过 /api/agents 后端接口管理智能体，替代之前的 localStorage 方案。
 *       提供加载、创建、更新、删除等能力，并对失败操作给出中文友好提示。
 * 原理：基于 Zustand，内部维护 agents 列表与 loading/error 状态，
 *       所有修改操作都调用后端 API，成功后更新本地缓存。
 *
 * 角色：作为"智能体数据层"，UI 组件只需调用 store 的方法，
 *       不需要直接 fetch 或处理 localStorage。
 */

"use client";

import { create } from "zustand";
import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";
import type { AgentConfig, Provider } from "@/lib/types";

export type LocalAgent = AgentConfig & {
  enabled: boolean;
  source: string;
  apiUrl: string;
  apiKey: string;
  tools: string[];
};

type AgentStore = {
  agents: LocalAgent[];
  loading: boolean;
  error: string | null;
  loadAgents: () => Promise<void>;
  addAgent: (agent: Omit<LocalAgent, "id">) => Promise<LocalAgent | null>;
  updateAgent: (id: string, patch: Partial<LocalAgent>) => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  toggleAgent: (id: string) => void;
};

function toLocalAgent(record: {
  id: string;
  name: string;
  avatar: string;
  color: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilityIds?: string[];
  apiUrl?: string;
  apiKey?: string;
}): LocalAgent {
  const meta = parseAgentMeta((record as { config?: unknown }).config);
  const source = providerToSource(record.provider);
  return {
    id: record.id,
    name: record.name,
    avatar: record.avatar,
    color: record.color,
    provider: record.provider as Provider,
    model: record.model,
    systemPrompt: record.systemPrompt,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    capabilityIds: record.capabilityIds ?? meta.capabilityIds,
    enabled: true,
    source,
    apiUrl: record.apiUrl ?? meta.apiUrl ?? sourceToApiUrl(source),
    apiKey: record.apiKey ?? meta.apiKey,
    tools: [],
  };
}

function providerToSource(provider: string): string {
  const map: Record<string, string> = {
    ollama: "Ollama",
    openai: "OpenAI Compatible",
    deepseek: "DeepSeek",
    anthropic: "Anthropic",
    custom: "Custom",
  };
  return map[provider] ?? "Ollama";
}

function sourceToApiUrl(source: string): string {
  if (source === "Ollama") return "http://localhost:11434";
  if (source === "DeepSeek") return "https://api.deepseek.com";
  if (source === "Anthropic") return "https://api.anthropic.com";
  if (source === "OpenAI Compatible") return "https://api.openai.com/v1";
  return "";
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  async loadAgents() {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("加载智能体失败");
      const data = (await res.json()) as Array<{
        id: string;
        name: string;
        avatar: string;
        color: string;
        provider: string;
        model: string;
        systemPrompt: string;
        temperature: number;
        maxTokens: number;
        capabilityIds?: string[];
      }>;
      const agents = data.map(toLocalAgent);
      set({ agents, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "加载智能体失败",
      });
    }
  },

  async addAgent(input) {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          avatar: input.avatar,
          color: input.color,
          provider: input.provider,
          model: input.model,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          capabilityIds: input.capabilityIds ?? [],
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "创建智能体失败");
      }
      const record = (await res.json()) as {
        id: string;
        name: string;
        avatar: string;
        color: string;
        provider: string;
        model: string;
        systemPrompt: string;
        temperature: number;
        maxTokens: number;
        capabilityIds?: string[];
      };
      const agent: LocalAgent = {
        ...toLocalAgent(record),
        enabled: true,
        source: input.source,
        apiUrl: input.apiUrl || sourceToApiUrl(input.source),
        apiKey: input.apiKey || "",
        tools: input.tools ?? [],
        capabilityIds: record.capabilityIds ?? input.capabilityIds ?? [],
      };
      set((state) => ({ agents: [...state.agents, agent], error: null }));
      return agent;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "创建智能体失败" });
      return null;
    }
  },

  async updateAgent(id, patch) {
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "更新智能体失败");
      }
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === id ? { ...agent, ...patch } : agent
        ),
        error: null,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "更新智能体失败" });
    }
  },

  async removeAgent(id) {
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除智能体失败");
      set((state) => ({
        agents: state.agents.filter((agent) => agent.id !== id),
        error: null,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "删除智能体失败" });
    }
  },

  toggleAgent(id) {
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, enabled: !agent.enabled } : agent
      ),
    }));
  },
}));
