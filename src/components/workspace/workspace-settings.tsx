"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Bot, KeyRound, Trash2, Wrench } from "lucide-react";
import type { Copy } from "./workspace-copy";
import { Panel } from "./workspace-primitives";

type ApiKeySummary = {
  id: string;
  provider: string;
  maskedKey: string;
  isValid: boolean;
  source: "provider" | "agent";
  agentName?: string;
};

export function SystemSettings({ t }: { t: Copy }) {
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [newProvider, setNewProvider] = useState("openai");
  const [newApiKey, setNewApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const isZh = t.language === "语言";

  async function fetchApiKeys(signal?: AbortSignal) {
    const response = await fetch("/api/api-keys", { signal });
    if (!response.ok) throw new Error("Failed to load API keys.");
    setApiKeys(await response.json() as ApiKeySummary[]);
  }

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/api-keys", { signal: controller.signal });
        if (!response.ok) throw new Error("Failed to load API keys.");
        setApiKeys(await response.json() as ApiKeySummary[]);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setApiKeys([]);
      }
    })();
    return () => controller.abort();
  }, []);

  async function addApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newApiKey.trim() || newApiKey.trim().length < 8) return;
    setLoading(true);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: newProvider, apiKey: newApiKey.trim() }) });
      if (!response.ok) throw new Error("Failed to save API key.");
      setNewApiKey("");
      await fetchApiKeys();
      setSaveMessage(isZh ? "已加密保存，下面会显示脱敏后的确认信息。" : "Encrypted and saved. A masked confirmation is shown below.");
    } catch {
      setSaveMessage(isZh ? "保存失败，请检查密钥和网络后重试。" : "Save failed. Check the key and network, then try again.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteApiKey(id: string) {
    const response = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setApiKeys((keys) => keys.filter((key) => key.id !== id));
  }

  return (
    <div className="space-y-5">
      <Panel title={t.settingsTitle} desc={t.settingsDesc}>
        <div className="grid gap-3 text-sm text-slate-600"><div className="flex items-center gap-2"><Wrench className="h-4 w-4" />{t.futureWork}</div><div className="flex items-center gap-2"><Bot className="h-4 w-4" />{t.simulationMode}</div></div>
      </Panel>
      <Panel title={isZh ? "API 密钥管理" : "API Key Management"} desc={isZh ? "按模型供应商保存加密密钥；页面只显示脱敏值。" : "Store encrypted keys by provider; the page only displays masked values."}>
        <form onSubmit={addApiKey} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-[160px_1fr] gap-3 max-md:grid-cols-1">
            <select className="field" value={newProvider} onChange={(event) => setNewProvider(event.target.value)} aria-label={isZh ? "模型供应商" : "Model provider"}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="deepseek">DeepSeek</option><option value="ollama">Ollama</option><option value="custom">Custom</option></select>
            <input className="field" type="password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} placeholder={isZh ? "输入 API Key，至少 8 个字符" : "Enter API Key - min 8 chars"} autoComplete="new-password" aria-label="API Key" />
          </div>
          <div className="flex justify-end"><button type="submit" disabled={loading || newApiKey.trim().length < 8} className="primary-button h-9 px-3"><KeyRound className="h-4 w-4" />{isZh ? "添加 API Key" : "Add API Key"}</button></div>
        </form>
        {saveMessage && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{saveMessage}</div>}
        <div className="mt-4 grid gap-2">
          {apiKeys.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{isZh ? "尚未保存 API Key。" : "No API keys stored yet."}</div>}
          {apiKeys.map((key) => <div key={key.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"><div><div className="text-sm font-medium text-slate-900">{key.provider}</div><div className="text-xs text-slate-500">{key.source === "agent" ? (isZh ? `智能体：${key.agentName ?? "未命名"}` : `Agent: ${key.agentName ?? "Unnamed"}`) : (isZh ? "全局供应商密钥" : "Global provider key")}</div><div className="mt-1 text-xs font-medium text-emerald-700">{key.isValid ? (isZh ? `已加密保存 · ${key.maskedKey}` : `Encrypted and saved · ${key.maskedKey}`) : (isZh ? "已保存，但当前不可用" : "Saved, but currently unavailable")}</div></div>{key.source === "provider" ? <button type="button" onClick={() => void deleteApiKey(key.id)} className="icon-button text-red-500" aria-label={isZh ? "删除 API Key" : "Delete API key"}><Trash2 /></button> : <div className="text-xs text-slate-400">{isZh ? "请到智能体设置中修改" : "Edit in Agent settings"}</div>}</div>)}
        </div>
      </Panel>
    </div>
  );
}
