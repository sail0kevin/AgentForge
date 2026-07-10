import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start and end of the zh copy object
# It starts at "  zh: {" and ends with "  }," before "  en:"
start_zh = None
end_zh = None
for i, line in enumerate(lines):
    if '  zh: {' in line and start_zh is None:
        start_zh = i
    if '  en: {' in line and end_zh is None and start_zh is not None:
        # The zh block ends just before en
        end_zh = i
        break

print(f"zh block: lines {start_zh+1} to {end_zh}")
print(f"Line {start_zh+1}: {lines[start_zh].rstrip()}")
print(f"Line {end_zh}: {lines[end_zh-1].rstrip()}")
print(f"Line {end_zh+1}: {lines[end_zh].rstrip()}")
