import type { WorkspaceSnapshot } from "@/lib/types";

export const demoWorkspace: WorkspaceSnapshot = {
  id: "workspace-local",
  name: "AgentForge",
  description: "Local-first workspace for sequential agent collaboration and development reports.",
  mode: "sequential",
  budgetLimit: 1,
  totalSpent: 0,
  status: "idle",
  agents: [],
  messages: [],
};
