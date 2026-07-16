import assert from "node:assert/strict";
import test from "node:test";
import {
  getUserKnowledgeStorageKey,
  LEGACY_LOCAL_KNOWLEDGE_KEY,
  LEGACY_LOCAL_MESSAGES_KEY,
  loadUserKnowledge,
  removeLegacyUnscopedWorkspaceData,
  saveUserKnowledge,
  type StorageLike,
} from "./user-storage";

function createStorage() {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

test("knowledge keys are isolated by user", () => {
  assert.notEqual(getUserKnowledgeStorageKey("user-a"), getUserKnowledgeStorageKey("user-b"));
  assert.throws(() => getUserKnowledgeStorageKey("   "), /user ID/i);
});

test("one user cannot read another user's browser knowledge", () => {
  const { storage } = createStorage();
  const snippet = { id: "k1", title: "A only", content: "private", createdAt: "2026-07-15T00:00:00.000Z" };
  saveUserKnowledge(storage, "user-a", [snippet]);

  assert.deepEqual(loadUserKnowledge(storage, "user-a"), [snippet]);
  assert.deepEqual(loadUserKnowledge(storage, "user-b"), []);
});

test("invalid browser records are discarded", () => {
  const { storage } = createStorage();
  storage.setItem(getUserKnowledgeStorageKey("user-a"), JSON.stringify([{ id: "missing-fields" }, null]));
  assert.deepEqual(loadUserKnowledge(storage, "user-a"), []);
});

test("unscoped v1 messages and knowledge are removed instead of assigned to a user", () => {
  const { storage, values } = createStorage();
  storage.setItem(LEGACY_LOCAL_MESSAGES_KEY, "old messages");
  storage.setItem(LEGACY_LOCAL_KNOWLEDGE_KEY, "old knowledge");

  removeLegacyUnscopedWorkspaceData(storage);

  assert.equal(values.has(LEGACY_LOCAL_MESSAGES_KEY), false);
  assert.equal(values.has(LEGACY_LOCAL_KNOWLEDGE_KEY), false);
});
