/**
 * 工作空间全局状态管理 Store
 *
 * 作用：管理整个 Multi-Agent Workspace 应用的核心状态，包括工作空间信息、
 *       Agent 列表、对话消息、运行状态、预算消耗等。
 *
 * 原理：基于 Zustand 轻量级状态管理库，采用单向数据流模式。
 *       所有组件通过 useWorkspaceStore() hook 订阅状态变化，
 *       通过 applyEvent() 方法统一处理来自 SSE 流式事件的增量更新。
 *       这种设计避免了 prop drilling，并且让事件溯源变得简单——
 *       每条消息的创建、Agent 的开始/完成/失败，都是一个独立的事件。
 *
 * 在整个框架里扮演什么角色：
 *       这是"状态层"。UI 组件不直接修改状态，而是通过 Store 的 action 间接更新。
 *       后端 SSE 事件也不直接操作 UI，而是通过 applyEvent() 更新 Store，
 *       UI 组件自动响应 Store 的变化重新渲染。
 *
 * 如何调用：
 *   import { useWorkspaceStore } from "@/store/workspace-store";
 *   const { messages, applyEvent } = useWorkspaceStore();
 */

"use client";

import { create } from "zustand";
import type { AgentConfig, RunEvent, WorkspaceMessage, WorkspaceSnapshot, WorkspaceStatus } from "@/lib/types";

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
  applyEvent: (event: RunEvent) => void;
  resetRun: () => void;
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

  /**
   * 设置整个工作空间快照
   *
   * 作用：当从后端加载工作空间时，一次性更新 workspace、agents、messages 等字段
   * 参数：workspace - 完整的工作空间快照对象
   */
  setWorkspace: (workspace) =>
    set({
      workspace,
      agents: workspace.agents,
      messages: workspace.messages,
      totalSpent: workspace.totalSpent,
      budgetStatus: workspace.status,
      error: null,
    }),

  /**
   * 重置当前运行状态
   *
   * 作用：开始新的一轮对话运行时，清空消息列表并标记为运行中
   * 注意：用户消息已经在发送时通过 user_message_created 事件添加了
   */
  resetRun: () =>
    set({
      isRunning: true,
      activeAgentId: null,
      error: null,
      messages: [],
      totalSpent: 0,
      budgetStatus: "running",
    }),

  /**
   * 应用 SSE 事件到 Store 状态（核心方法）
   *
   * 作用：统一处理从后端 SSE 流推送过来的各类事件，增量更新 store 状态
   * 原理：采用事件溯源模式，每种事件类型对应一种状态转换
   *
   * 支持的事件类型：
   *   - workspace_loaded: 工作空间初始化加载完成
   *   - user_message_created: 用户消息已创建，追加到消息列表
   *   - agent_started: 某个 Agent 开始推理，记录 activeAgentId
   *   - agent_completed: Agent 完成推理，追加回复消息
   *   - agent_failed: Agent 推理失败，追加失败消息并记录错误
   *   - budget_exhausted: 预算耗尽，停止运行
   *   - run_completed: 整轮运行结束
   *   - error: 全局错误
   *
   * 参数：event - SSE 事件对象，包含 type 字段和对应的数据载荷
   */
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
        case "user_message_created":
          return { messages: [...state.messages, event.message] };
        case "agent_started":
          return { activeAgentId: event.agent.id, isRunning: true };
        case "agent_completed":
          return {
            messages: [...state.messages, event.message],
            activeAgentId: null,
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
          };
        case "agent_failed":
          return {
            messages: [...state.messages, event.message],
            activeAgentId: null,
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
            error: event.error,
          };
        case "budget_exhausted":
          return { totalSpent: event.totalSpent, budgetStatus: "exhausted", isRunning: false, activeAgentId: null };
        case "run_completed":
          return {
            totalSpent: event.totalSpent,
            budgetStatus: event.budgetStatus,
            isRunning: false,
            activeAgentId: null,
          };
        case "error":
          return { error: event.message, isRunning: false, activeAgentId: null };
        default:
          return state;
      }
    }),
}));
