import os

path = r'src/components/workspace/workspace-app.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the useEffect to load messages from database
old_useEffect = '''  useEffect(() => {
    queueMicrotask(() => {
      setLanguage(loadLanguage());
      loadAgents();
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
    # Try to find it with different whitespace
    import re
    pattern = r'useEffect\(\(\) => \{\s+queueMicrotask\(\(\) => \{\s+setLanguage\(loadLanguage\(\)\);\s+loadAgents\(\);\s+setKnowledgeSnippetsState\(loadLocalKnowledge\(\)\);\s+setWorkspace\(\{\s+\.\.\.initialWorkspace,\s+agents: \[\],\s+messages: loadLocalMessages\(\),\s+totalSpent: 0,\s+status: "idle"\}\);\s+\}\);\s+\}, \[initialWorkspace, setWorkspace\]\);'
    match = re.search(pattern, content)
    if match:
        print(f"Found match at position {match.start()}-{match.end()}")
    else:
        print("Regex also failed")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("File saved")
