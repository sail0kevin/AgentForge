import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

# The issue is clear: the Chinese text in the zh copy object is double-encoded.
# The original UTF-8 bytes were interpreted as GBK and then re-encoded as UTF-8.
# 
# For example: "瀵硅瘽绌洪棿" is the GBK interpretation of the UTF-8 bytes for "对话空间"
# 
# The fix is to:
# 1. Take the corrupted text
# 2. Encode it as GBK (which reverses the misinterpretation)
# 3. Decode the result as UTF-8 (which gives the original correct Chinese)
#
# Let me test this:

test = "瀵硅瘽绌洪棿"
# Try to encode as GBK and decode as UTF-8
try:
    fixed = test.encode('gbk').decode('utf-8')
    print(f"Fixed: {fixed}")
except:
    print("GBK encode failed")

# Try another approach: latin1 -> gbk
try:
    fixed = test.encode('latin1').decode('gbk')
    print(f"Fixed via latin1->gbk: {fixed}")
except:
    print("latin1->gbk failed")

# Try: the text was originally UTF-8, but was decoded as GBK
# So we need to encode as GBK (to get the original bytes) then decode as UTF-8
try:
    fixed = test.encode('gbk').decode('utf-8')
    print(f"Fixed via gbk->utf8: {fixed}")
except Exception as e:
    print(f"gbk->utf8 failed: {e}")
