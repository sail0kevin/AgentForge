import type { WorkspaceSnapshot } from "@/lib/types";

export const demoWorkspace: WorkspaceSnapshot = {
  id: "workspace-local",
  name: "AgentForge",
  description: "Local-first workspace for turning product requirements into evidence-aware product/UI implementation reports.",
  mode: "sequential",
  budgetLimit: 1,
  totalSpent: 0,
  status: "idle",
  agents: [],
  messages: [],
};
