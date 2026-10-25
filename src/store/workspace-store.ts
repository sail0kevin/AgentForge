/**
 * 工作空间全局状态 Store（Zustand，单向数据流）。
 * UI 组件不直接改状态，只通过 action 更新；后端 SSE 事件统一经 applyEvent()
 * 做增量转换——每条消息创建、Agent 开始/完成/失败都是独立事件，便于事件溯源。
 */

"use client";

import { create } from "zustand";
import type { AgentConfig, RunEvent, WorkspaceMessage, WorkspaceSnapshot, WorkspaceStatus } from "@/lib/types";

function appendMessageOnce(messages: WorkspaceMessage[], message: WorkspaceMessage) {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

function syncWorkspaceMessages(workspace: WorkspaceSnapshot | null, messages: WorkspaceMessage[], updates: Partial<Pick<WorkspaceSnapshot, "totalSpent" | "status">> = {}) {
  return workspace ? { ...workspace, ...updates, messages } : workspace;
}

type WorkspaceStore = {
  workspace: WorkspaceSnapshot | null;
  agents: AgentConfig[];
  messages: WorkspaceMessage[];
  activeAgentId: string | null;
  isRunning: boolean;
  error: string | null;
  totalSpent: number;
  budgetStatus: WorkspaceStatus;
  setWorkspace: (workspace: WorkspaceSnapshot) => void;
  mergeMessages: (messages: WorkspaceMessage[]) => void;
  beginRun: () => void;
  applyEvent: (event: RunEvent) => void;
  resetRun: () => void;
  clearSession: () => void;
};

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: null,
  agents: [],
  messages: [],
  activeAgentId: null,
  isRunning: false,
  error: null,
  totalSpent: 0,
 budgetStatus: "idle",

  /** 从后端加载工作空间时一次性更新全部快照字段。 */
  setWorkspace: (workspace) =>
    set({
      workspace,
      agents: workspace.agents,
      messages: workspace.messages,
      totalSpent: workspace.totalSpent,
      budgetStatus: workspace.status,
      error: null,
    }),

  /** 加载历史期间用户可能已发送新消息：按 ID 去重合并，历史不覆盖新消息、新消息不丢历史。 */
  mergeMessages: (incomingMessages) =>
    set((state) => {
      const messageMap = new Map<string, WorkspaceMessage>();
      for (const message of incomingMessages) messageMap.set(message.id, message);
      for (const message of state.messages) messageMap.set(message.id, message);
      const messages = [...messageMap.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return {
        messages,
        workspace: syncWorkspaceMessages(state.workspace, messages),
      };
    }),

  /**
   * 标记新一轮对话开始
   *
   * 与 resetRun 不同：这里只锁定发送状态并清除旧错误，不会清空历史消息。
   */
  beginRun: () =>
    set((state) => ({
      isRunning: true,
      activeAgentId: null,
      error: null,
      budgetStatus: "running",
      workspace: state.workspace ? { ...state.workspace, status: "running" } : state.workspace,
    })),

  /** 重置当前运行状态：清空消息并标记运行中；用户消息已随 user_message_created 事件添加。 */
  resetRun: () =>
    set({
      isRunning: true,
      activeAgentId: null,
      error: null,
      messages: [],
      totalSpent: 0,
      budgetStatus: "running",
    }),

  /** 登出或切换账号时清除模块级 Store，避免旧账号状态短暂显示给新账号。 */
  clearSession: () =>
    set({
      workspace: null,
      agents: [],
      messages: [],
      activeAgentId: null,
      isRunning: false,
      error: null,
      totalSpent: 0,
      budgetStatus: "idle",
    }),

  /** 统一应用后端 SSE 事件：每种事件类型对应一种状态转换，事件清单见下方 switch。 */
  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case "workspace_loaded":
          return {
            workspace: event.workspace,
            agents: event.workspace.agents,
            messages: event.workspace.messages,
            totalSpent: event.workspace.totalSpent,
            budgetStatus: "running",
            isRunning: true,
          };
        case "user_message_created": {
          const messages = appendMessageOnce(state.messages, event.message);
          return {
            messages,
            workspace: syncWorkspaceMessages(state.workspace, messages),
          };
        }
        case "agent_started":
          return {
            activeAgentId: event.agent.id,
            isRunning: true,
            error: null,
            budgetStatus: "running",
            workspace: state.workspace ? { ...state.workspace, status: "running" } : state.workspace,
          };
        case "agent_completed": {
          const messages = appendMessageOnce(state.messages, event.message);
          return {
            messages,
            workspace: syncWorkspaceMessages(state.workspace, messages, { totalSpent: event.totalSpent, status: event.budgetStatus }),
            activeAgentId: null,
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
          };
        }
        case "agent_failed": {
          const messages = appendMessageOnce(state.messages, event.message);
          return {
            messages,
            workspace: syncWorkspaceMessages(state.workspace, messages, { totalSpent: event.totalSpent, status: event.budgetStatus }),
            activeAgentId: null,
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
            error: event.error,
          };
        }
        case "budget_exhausted":
          return {
            totalSpent: event.totalSpent,
            budgetStatus: "exhausted",
            isRunning: false,
            activeAgentId: null,
            workspace: state.workspace ? { ...state.workspace, totalSpent: event.totalSpent, status: "exhausted" } : state.workspace,
          };
        case "run_completed":
          return {
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
            isRunning: false,
            activeAgentId: null,
            workspace: state.workspace ? { ...state.workspace, totalSpent: event.totalSpent, status: event.budgetStatus } : state.workspace,
          };
        case "error":
          return {
            error: event.message,
            isRunning: false,
            activeAgentId: null,
            workspace: state.workspace ? { ...state.workspace, status: "idle" } : state.workspace,
          };
        default:
          return state;
      }
    }),
}));
