import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

# Read README
with open('README.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Try to fix encoding using gbk->utf8 round trip
# But only on lines that have corruption
lines = content.split('\n')
fixed_lines = []
for line in lines:
    try:
        fixed = line.encode('gbk').decode('utf-8')
        fixed_lines.append(fixed)
    except (UnicodeDecodeError, UnicodeEncodeError):
        fixed_lines.append(line)

fixed_content = '\n'.join(fixed_lines)

# Write fixed content back
with open('README.md', 'w', encoding='utf-8') as f:
    f.write(fixed_content)

print('README encoding fixed')
