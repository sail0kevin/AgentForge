import type { WorkspaceSnapshot } from "@/lib/types";

export const demoWorkspace: WorkspaceSnapshot = {
  id: "workspace-local",
  name: "Multi-Agent Workspace",
  description: "Local-first workspace for manually created agents and sequential multi-agent chat.",
  mode: "sequential",
  budgetLimit: 1,
  totalSpent: 0,
  status: "idle",
  agents: [],
  messages: [],
};
