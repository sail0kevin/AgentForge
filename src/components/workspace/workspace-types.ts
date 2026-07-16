import type { AgentConfig, CapabilityDefinition } from "@/lib/types";

export type PageKey = "chat" | "creator" | "tools" | "dashboard" | "settings";
export type ThemeMode = "light" | "dark";
export type AgentForm = Omit<AgentConfig, "id">;
export type LocalAgent = AgentConfig & {
  enabled: boolean;
  source: string;
  apiUrl: string;
  credentialConfigured: boolean;
  maskedKey: string | null;
  keyLength: number | null;
  tools: string[];
};
export type WorkspaceCapability = CapabilityDefinition & { enabled: boolean };

/** Current-user knowledge document returned by GET /api/documents. */
export type DocumentItem = {
  id: string;
  fileName: string;
  title: string;
  format: string;
  size: number;
  sourceVersion?: string;
  license?: string;
  reviewedAt?: string | null;
  createdAt: string;
  _count?: { chunks: number };
};
