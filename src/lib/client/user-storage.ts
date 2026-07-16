import type { KnowledgeSnippet } from "@/lib/types";

export const LEGACY_LOCAL_MESSAGES_KEY = "multi-agent-workspace.local-messages.v1";
export const LEGACY_LOCAL_KNOWLEDGE_KEY = "multi-agent-workspace.local-knowledge.v1";

const USER_KNOWLEDGE_PREFIX = "multi-agent-workspace.user-knowledge.v2";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * 浏览器知识片段仍是过渡能力，但必须绑定到明确的用户命名空间。
 * 未带用户 ID 时直接拒绝生成键，避免重新退化为跨账号共享数据。
 */
export function getUserKnowledgeStorageKey(userId: string): string {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error("A user ID is required for browser knowledge storage.");
  return `${USER_KNOWLEDGE_PREFIX}.${encodeURIComponent(normalizedUserId)}`;
}

function isKnowledgeSnippet(value: unknown): value is KnowledgeSnippet {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && typeof item.content === "string"
    && typeof item.createdAt === "string";
}

export function loadUserKnowledge(storage: StorageLike, userId: string): KnowledgeSnippet[] {
  try {
    const parsed = JSON.parse(storage.getItem(getUserKnowledgeStorageKey(userId)) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isKnowledgeSnippet).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function saveUserKnowledge(storage: StorageLike, userId: string, snippets: KnowledgeSnippet[]): void {
  storage.setItem(getUserKnowledgeStorageKey(userId), JSON.stringify(snippets.filter(isKnowledgeSnippet).slice(0, 50)));
}

/**
 * v1 数据没有用户归属，无法安全迁移给任意一个账号，因此只删除、不自动认领。
 * 消息历史已经以数据库为唯一可信来源。
 */
export function removeLegacyUnscopedWorkspaceData(storage: StorageLike): void {
  storage.removeItem(LEGACY_LOCAL_MESSAGES_KEY);
  storage.removeItem(LEGACY_LOCAL_KNOWLEDGE_KEY);
}
