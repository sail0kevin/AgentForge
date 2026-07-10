import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/lib/rag/document-service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Check if file has literal backslash-quote
if '\\"' in content:
    print(f"Found {content.count(chr(92)+chr(34))} backslash-quote sequences")
    content = content.replace('\\"', '"')
    with open('src/lib/rag/document-service.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed backslash-quotes')
else:
    print('No backslash-quotes found')
    # Show raw bytes of import line
    lines = content.split('\\n')
    for i, line in enumerate(lines):
        if '@/lib' in line:
            print(f"Line {i+1}: {repr(line)}")
            break
