# -*- coding: utf-8 -*-
import json, urllib.request, io, datetime

BASE = "http://localhost:3000"

def req(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read()
            return resp.status, raw.decode("utf-8", errors="replace"), True
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace"), False

log = io.open(r"G:\projects\agent-learning\projects\Multi-Agent-Workspace\scripts\verify.log", "w", encoding="utf-8")
def p(m):
    print(m)
    log.write(m + "\n")

p("START " + datetime.datetime.now().isoformat())

p("\nStep 1: POST /api/agents")
agent = {"name":"Verify","avatar":"V","color":"#10b981","provider":"ollama","model":"llama3.1","systemPrompt":"Reply concisely.","temperature":0.7,"maxTokens":200,"capabilityIds":[],"apiUrl":"http://localhost:11434","apiKey":""}
status, raw, ok = req("POST", "/api/agents", agent)
p("  status=%d ok=%s" % (status, ok))
agent_id = json.loads(raw)["id"]
p("  agent_id=%s apiKey=%r" % (agent_id, json.loads(raw).get("apiKey")))

p("\nStep 2: SSE stream")
run_body = {"input":"Hello 10 words.","agents":[{"id":agent_id,"name":"Verify","avatar":"V","color":"#10b981","provider":"ollama","model":"llama3.1","systemPrompt":"Reply concisely.","temperature":0.7,"maxTokens":200,"capabilityIds":[],"apiUrl":"http://localhost:11434","apiKey":"","enabled":True}],"useRag":False,"knowledgeSnippets":[]}
events = []
status, raw, ok = req("POST", "/api/workspaces/manual/run", run_body)
p("  status=%d len=%d" % (status, len(raw)))
for line in raw.split("\n"):
    if line.startswith("data: "):
        try:
            events.append(json.loads(line[6:]))
        except Exception:
            pass
p("  events=%d" % len(events))
for ev in events:
    t = ev.get("type","?")
    if t == "agent_completed":
        p("  - %s : %s" % (t, ev.get("message",{}).get("content","")[:100]))
    elif t == "agent_failed":
        p("  - %s : %s" % (t, ev.get("error","")[:100]))
    else:
        p("  - %s" % t)

p("\nStep 3: persistence")
status, raw, ok = req("GET", "/api/agents")
agents = json.loads(raw)
p("  count=%d has_our_agent=%s" % (len(agents), any(a["id"]==agent_id for a in agents)))

status, raw, ok = req("GET", "/api/workspaces/manual/messages")
p("  messages=%d" % len(json.loads(raw)))

status, raw, ok = req("GET", "/api/dashboard/stats")
p("  stats=%s" % raw[:200])

p("\nDONE")
log.close()
