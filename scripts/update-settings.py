import re

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''function SystemSettings({ t }: { t: Copy }) {
  return (
    <Panel title={t.settingsTitle} desc={t.settingsDesc}>
      <div className="grid gap-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          {t.apiKeyStorage}
        </div>
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          {t.futureWork}
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          {t.simulationMode}
        </div>
      </div>
    </Panel>
  );
}'''

new_code = '''function SystemSettings({ t }: { t: Copy }) {
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; provider: string; maskedKey: string; isValid: boolean }>>([]);
  const [newProvider, setNewProvider] = useState<string>("openai");
  const [newApiKey, setNewApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  async function fetchApiKeys() {
    try {
      const response = await fetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch {
      // ignore
    }
  }

  async function addApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newApiKey.trim() || newApiKey.trim().length < 8) return;
    setLoading(true);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider, apiKey: newApiKey.trim() }),
      });
      if (response.ok) {
        setNewApiKey("");
        await fetchApiKeys();
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteApiKey(id: string) {
    try {
      await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      setApiKeys((keys) => keys.filter((key) => key.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-5">
      <Panel title={t.settingsTitle} desc={t.settingsDesc}>
        <div className="grid gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {t.futureWork}
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            {t.simulationMode}
          </div>
        </div>
      </Panel>
      <Panel title="API Key Management" desc="Store encrypted API keys for different providers. Keys are encrypted before saving to the database.">
        <form onSubmit={addApiKey} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-[160px_1fr] gap-3 max-md:grid-cols-1">
            <select className="field" value={newProvider} onChange={(event) => setNewProvider(event.target.value)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
              <option value="ollama">Ollama</option>
              <option value="custom">Custom</option>
            </select>
            <input className="field" type="password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} placeholder="Enter API Key - min 8 chars" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={loading || !newApiKey.trim() || newApiKey.trim().length < 8} className="primary-button h-9 px-3">
              <KeyRound className="h-4 w-4" />
              Add API Key
            </button>
          </div>
        </form>
        <div className="mt-4 grid gap-2">
          {apiKeys.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No API keys stored yet.</div>}
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{key.provider}</div>
                <div className="text-xs text-slate-500">{key.maskedKey}</div>
              </div>
              <button type="button" onClick={() => deleteApiKey(key.id)} className="icon-button text-red-500" aria-label="Delete API key">
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}'''

if old in content:
    content = content.replace(old, new_code)
    with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SystemSettings updated successfully')
else:
    print('ERROR: Could not find the old SystemSettings code')
