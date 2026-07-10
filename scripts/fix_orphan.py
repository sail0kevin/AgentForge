import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix 1: Remove orphan duplicate comment lines 461-464 (0-indexed: 460-463)
# These are: "   * 鍔犺浇鏂囨。鍒楄〃", "   *", ... "   */"
# They should be removed entirely
del lines[460:464]

# Fix 2: Fix line 623 (now shifted by -4 = 619) - template literal with garbled Chinese
# Find the line with the template literal containing garbled Chinese
for i, line in enumerate(lines):
    if '鎴戠湅鍒颁簡浣犵殑杈撳叆' in line:
        # This is the line with garbled Chinese in template literal
        # Replace with proper Chinese
        lines[i] = line.replace(
            '"鎴戠湅鍒颁簡浣犵殑杈撳叆"',
            '"我看到你的输入"'
        ).replace(
            '"浣嗚繖娆℃ā鍨嬭皟鐢ㄦ病鏈夋垚鍔?"',
            '"但这次模型调用没有成功"'
        )
        print(f"Fixed line {i+1}")

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Fixed orphan comment and template literal')
