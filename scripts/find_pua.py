import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find all lines with problematic characters
for i, line in enumerate(lines):
    # Check for characters in the Private Use Area (PUA) which often indicate corruption
    for c in line:
        cp = ord(c)
        if cp >= 0xE000 and cp <= 0xF8FF:
            print(f"Line {i+1}: char U+{cp:04X} in: {repr(line[:200])}")
            break
