import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('README.md', 'rb') as f:
    raw = f.read()

# Check first 100 bytes
print(f"First 100 bytes: {raw[:100]}")
print()
# Try decoding as utf-8
try:
    text = raw.decode('utf-8')
    print("Decoded as UTF-8 successfully")
    print(f"First 200 chars: {text[:200]}")
except:
    print("UTF-8 decode failed")
