import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check lines 56-156 for remaining issues
for i in range(55, 156):
    line = lines[i]
    # Check if line has characters that look corrupted
    # Corrupted lines have: 1) unterminated strings, 2) non-ASCII that isn't proper Chinese
    # Simple heuristic: if the line has high-byte characters mixed with ASCII in a weird way
    try:
        line.encode('ascii')
        continue  # Pure ASCII, no issue
    except UnicodeEncodeError:
        pass
    
    # Try to detect if Chinese is proper
    # Proper Chinese chars are mostly in CJK range (4E00-9FFF)
    # Corrupted chars often in other ranges
    has_cjk = any('\u4e00' <= c <= '\u9fff' for c in line)
    has_non_cjk_non_ascii = any(ord(c) > 127 and not ('\u4e00' <= c <= '\u9fff') and c not in '，。、：；！？“”‘’（）【】《》' for c in line)
    
    if has_non_cjk_non_ascii:
        print(f"Line {i+1}: {line.rstrip()[:120]}")
