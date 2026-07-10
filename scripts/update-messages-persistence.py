import os

path = r'src/components/workspace/workspace-app.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add a function to load messages from database (after saveLocalMessages)
load_messages_func = '''
/**
 * 从数据库加载手动工作区的历史消息
 *
 * 作用：页面刷新后，从后端取回历史对话，替代之前的 localStorage 方案。
 * 原理：调用 GET /api/workspaces/manual/messages，返回按时间排序的消息列表。
 * 注意：这是异步函数，需要在 useEffect 中调用。
 */
async function loadPersistedMessages(): Promise<WorkspaceMessage[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/workspaces/manual/messages");
    if (!res.ok) throw new Error("Failed to load messages");
    const data = (await res.json()) as WorkspaceMessage[];
    return Array.isArray(data) ? data : [];
  } catch {
    // 降级到 localStorage
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LOCAL_MESSAGES_KEY) || "[]") as WorkspaceMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

/**
 * 清空手动工作区的历史消息
 *
 * 作用：用户点击"清空对话"时，同时清除数据库和本地的消息。
 * 原理：调用 DELETE /api/workspaces/manual/messages，并清空 localStorage。
 */
async function clearPersistedMessages(): Promise<void> {
  try {
    await fetch("/api/workspaces/manual/messages", { method: "DELETE" });
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_MESSAGES_KEY);
}

'''

# Insert after saveLocalMessages function
insert_after = '''function saveLocalMessages(messages: WorkspaceMessage[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages.slice(-100)));
}
'''
if insert_after in content:
    content = content.replace(insert_after, insert_after + "\n" + load_messages_func)
    print("Added loadPersistedMessages and clearPersistedMessages functions")
else:
    print("WARNING: Could not find insert point")

# 2. Update the useEffect to load messages from database
old_useEffect = '''  useEffect(() => {
    queueMicrotask(() => {
      setLanguage(loadLanguage());
      setLocalAgentsState(loadLocalAgents());
      setKnowledgeSnippetsState(loadLocalKnowledge());
      setWorkspace({ ...initialWorkspace, agents: [], messages: loadLocalMessages(), totalSpent: 0, status: "idle" });
    });
  }, [initialWorkspace, setWorkspace]);'''

new_useEffect = '''  useEffect(() => {
    queueMicrotask(() => {
      setLanguage(loadLanguage());
      loadAgents();
      setKnowledgeSnippetsState(loadLocalKnowledge());
    });
    // Load messages from database asynchronously
    loadPersistedMessages().then((messages) => {
      setWorkspace({ ...initialWorkspace, agents: [], messages, totalSpent: 0, status: "idle" });
    });
  }, [initialWorkspace, setWorkspace, loadAgents]);'''

if old_useEffect in content:
    content = content.replace(old_useEffect, new_useEffect)
    print("Updated useEffect to load messages from database")
else:
    print("WARNING: Could not find useEffect to update")

# 3. Update saveLocalMessages effect to not save messages to localStorage (they're already in DB)
old_save_effect = '''  useEffect(() => {
    saveLocalMessages(visibleMessages);
  }, [visibleMessages]);'''

new_save_effect = '''  useEffect(() => {
    // Messages are persisted via the manual/run API, no need to duplicate to localStorage
  }, [visibleMessages]);'''

if old_save_effect in content:
    content = content.replace(old_save_effect, new_save_effect)
    print("Updated saveLocalMessages effect")
else:
    print("WARNING: Could not find saveLocalMessages effect to update")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("File saved")
