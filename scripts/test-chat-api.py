import urllib.request
import json

body = {
    'input': '你好',
    'agents': [{
        'id': 'test1',
        'name': 'TestAgent',
        'avatar': 'AI',
        'color': '#38bdf8',
        'provider': 'ollama',
        'model': 'llama3.1',
        'systemPrompt': '你是一个助手',
        'temperature': 0.7,
        'maxTokens': 1200,
        'capabilityIds': [],
        'apiKey': '',
        'apiUrl': 'http://localhost:11434',
        'enabled': True
    }],
    'useRag': False,
    'knowledgeSnippets': []
}

req = urllib.request.Request(
    'http://localhost:3000/api/workspaces/manual/run',
    data=json.dumps(body).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print(f'Status: {resp.status}')
        content = resp.read().decode('utf-8')
        for line in content.split('\n'):
            if line.startswith('data: '):
                event = json.loads(line[6:])
                etype = event.get('type', 'unknown')
                print(f'Event: {etype}')
                if etype == 'agent_completed':
                    agent_name = event.get('agent', {}).get('name', 'unknown')
                    msg_content = event.get('message', {}).get('content', '')[:200]
                    print(f'  Agent: {agent_name}')
                    print(f'  Content: {msg_content}')
except Exception as e:
    print(f'Error: {e}')
