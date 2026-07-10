import { WorkspaceApp } from "@/components/workspace/workspace-app";

export default function Home() {
  return (
    <WorkspaceApp
      initialWorkspace={{
        id: "local",
        name: "Local Workspace",
        description: "Local manual multi-agent run workspace",
        mode: "sequential",
        budgetLimit: 999999,
        agents: [],
        messages: [],
        totalSpent: 0,
        status: "idle",
      }}
    />
  );
}
