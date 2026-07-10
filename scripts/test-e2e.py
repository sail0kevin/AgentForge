# -*- coding: utf-8 -*-
import json, urllib.request, urllib.error, sys, time

BASE = "http://localhost:3000"

def req(method, path, body=None):
    url = BASE + path
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8"), resp.headers.get("content-type","")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace"), ""

print("=" * 60)
print("STEP 1: create agent (should persist + return apiUrl/apiKey)")
print("=" * 60)
agent_body = {
    "name": "Test Analyst",
    "avatar": "TA",
    "color": "#5B5BD6",
    "provider": "ollama",
    "model": "llama3.1",
    "systemPrompt": "You are a senior analyst. Answer concisely.",
    "temperature": 0.7,
    "maxTokens": 1200,
    "capabilityIds": [],
    "apiUrl": "http://localhost:11434",
    "apiKey": "",
}
status, raw, ct = req("POST", "/api/agents", agent_body)
print(f"  HTTP {status}")
try:
    data = json.loads(raw)
    print(f"  agent_id: {data.get('id')}")
    print(f"  apiUrl returned: {data.get('apiUrl')}")
    print(f"  apiKey returned: {repr(data.get('apiKey'))}")
    agent_id = data["id"]
except Exception as e:
    print(f"  ERROR parsing: {e}")
    print(f"  Raw: {raw[:500]}")
    sys.exit(1)

print()
print("=" * 60)
print("STEP 2: GET /api/agents (should list 1 agent with apiUrl)")
print("=" * 60)
status, raw, ct = req("GET", "/api/agents")
print(f"  HTTP {status}")
try:
    data = json.loads(raw)
    print(f"  count: {len(data)}")
    if data:
        print(f"  first: {data[0]['name']} apiUrl={data[0].get('apiKey')}")
except Exception as e:
    print(f"  ERROR: {e}")
    print(f"  Raw: {raw[:500]}")

print()
print("=" * 60)
print("STEP 3: POST /api/workspaces/manual/run (SSE stream)")
print("=" * 60)
run_body = {
    "input": "Say hello in one sentence.",
    "agents": [{
        "id": agent_id,
        "name": "Test Analyst",
        "avatar": "TA",
        "color": "#5B5BD6",
        "provider": "ollama",
        "model": "llama3.1",
        "systemPrompt": "You are a senior analyst. Answer concisely.",
        "temperature": 0.7,
        "maxTokens": 1200,
        "capabilityIds": [],
        "apiUrl": "http://localhost:11434",
        "apiKey": "",
        "enabled": True,
    }],
    "useRag": False,
    "knowledgeSnippets": [],
}
req_obj = urllib.request.Request(
    BASE + "/api/workspaces/manual/run",
    data=json.dumps(run_body).encode("utf-8"),
    method="POST",
    headers={"Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req_obj, timeout=30) as resp:
        print(f"  HTTP {resp.status}")
        body = resp.read().decode("utf-8", errors="replace")
        events = [line for line in body.split("\n") if line.startswith("data: ")]
        print(f"  events received: {len(events)}")
        for ev_line in events[:10]:
            try:
                ev = json.loads(ev_line[6:])
                etype = ev.get("type","?")
                if etype == "agent_completed":
                    agent_name = ev.get("agent", {}).get("name","?")
                    content = ev.get("message", {}).get("content", "")
                    print(f"  - agent_completed [{agent_name}]: {content[:120]}...")
                elif etype == "agent_failed":
                    agent_name = ev.get("agent", {}).get("name","?")
                    err = ev.get("error", "")
                    print(f"  - agent_failed [{agent_name}]: {err[:120]}")
                else:
                    print(f"  - {etype}")
            except Exception as e:
                print(f"  - parse error: {e}")
        if "simulation mode" in body.lower():
            print("  >> simulation mode response detected (expected if Ollama not running)")
except urllib.error.HTTPError as e:
    print(f"  FAIL HTTP {e.code}: {e.read().decode('utf-8',errors='replace')[:300]}")
except Exception as e:
    print(f"  ERROR: {e}")

print()
print("=" * 60)
print("STEP 4: POST agent with Chinese API Key (should be sanitized)")
print("=" * 60)
bad_body = {
    "name": "Bad Key Agent",
    "provider": "ollama",
    "model": "llama3.1",
    "systemPrompt": "System prompt longer than ten chars.",
    "apiUrl": "http://localhost:11434",
    "apiKey": "中文密钥",
}
status, raw, ct = req("POST", "/api/agents", bad_body)
print(f"  HTTP {status}")
if status == 201:
    print(f"  created (Chinese key saved in DB but UI sanitizes before send)")

print()
print("DONE")
