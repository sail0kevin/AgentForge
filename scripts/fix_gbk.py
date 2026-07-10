import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The zh block is lines 56-156 (1-indexed), i.e. index 55-155
# Fix each line by trying gbk->utf8 round-trip
fixed_lines = []
for i, line in enumerate(lines):
    if i < 55 or i > 155:
        fixed_lines.append(line)
        continue
    
    # Try to fix the line
    # The corruption: original UTF-8 bytes were decoded as GBK
    # Fix: encode as GBK to recover original bytes, then decode as UTF-8
    try:
        fixed = line.encode('gbk').decode('utf-8')
        fixed_lines.append(fixed)
    except (UnicodeDecodeError, UnicodeEncodeError):
        # If the round-trip fails (e.g. line has no corruption), keep original
        fixed_lines.append(line)

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(fixed_lines)

print('Applied gbk->utf8 fix to zh block')
