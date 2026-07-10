import os
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find where the zh copy object ends (looking for the closing brace)
# Lines 59-105 were reported as errors
# Let's see lines around there
for i in range(55, 110):
    line = lines[i]
    # Check if it contains garbled characters
    has_garbled = any(ord(c) > 127 for c in line)
    marker = " [GARBLED]" if has_garbled else ""
    print(f"Line {i+1}{marker}: {line.rstrip()[:120]}")
