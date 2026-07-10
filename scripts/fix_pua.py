import os, sys
os.chdir(r'G:\projects\agent-learning\projects\Multi-Agent-Workspace')
sys.stdout.reconfigure(encoding='utf-8')

with open('src/components/workspace/workspace-app.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Build mapping from corrupted (PUA) characters to correct Chinese
# Pattern: the file was created by interpreting GBK bytes as Unicode code points
# The correct characters need to be derived from context

replacements = {
    '\ue505': '础',   # 基础 -> 鍩虹础
    '\ue1ee': '对',   # 对话 -> 对�话
    '\ue224': '息',   # 消息 -> 消�息
    '\ue21c': '用',   # 启用 -> 启�用
    '\ue044': '个',   # 一个 -> 一�个
    '\ue218': '。',   # 消息。 -> 消�息�。
    '\ue632': '复',   # 回复 -> 回�复
    '\ue0a2': '填',   # 填写 -> 填�写
    '\ue045': '智',   # 智能体 -> 智�能体
    '\ue15f': '中',   # 中文 -> 中�文
    '\ue101': '本',   # 本地 -> 本�地
    '\ue0bc': '序',   # 程序 -> 程�序
    '\ue15e': '送',   # 发送 -> 发�送
    '\ue219': '可',   # 可以 -> 可�以
    '\ue1bc': '置',   # 配置 -> 配�置
    '\ue048': '未',   # 未配 -> 未�配
    '\ue1ba': '以',   # 可以 -> 可�以 (editingHint context)
    '\ue042': '。',   # 。 -> �。
    '\ue047': '能',   # 能力 -> 能�力
    '\ue1bd': '修',   # 修改 -> 修�改
    '\ue6e7': '如',   # 例如 -> 例�如
    '\ue1e2': '语',   # 语言 -> 语�言
    '\ue100': '本',   # 本地 -> 本�地
    '\ue21b': '可',   # 可以 -> 可�以
    '\ue187': '记',   # 记忆 -> 记�忆
    '\ue57d': '题',   # 标题 -> 标�题
    '\ue1bf': '目',   # 项目 -> 项�目
    '\ue1e9': '说',   # 说明 -> 说�明
    '\ue511': '运',   # 运行 -> 运�行
    '\ue18c': '片',   # 片段 -> 片�段
    '\ue21d': '见',   # 可见 -> 可�见
    '\ue746': '消',   # 消息 -> 消�息 (visibleMessages context)
    '\ue11c': '正',   # 正式 -> 正�式
    '\ue046': '用',   # 用于 -> 用�于
    '\ue74d': '浏',   # 浏览 -> 浏�览
    '\ue06c': '端',   # 后端 -> 后�端
    '\ue0ff': '优',   # 优先 -> 优�先
    '\ue21a': '已',   # 已经 -> 已�经
    '\ue1da': '该',   # 该 Ke -> 该� Ke
    '\ue0a2': '填',   # 填写 -> 填�写
    '\ue1be': '构',   # 结构 -> 结�构
    '\ue5ca': '装',   # 组装 -> 组�装
    '\ue749': '规',   # 规则 -> 规�则
    '\ue76c': '索',   # 检索 -> 检�索
    '\ue5c5': '检',   # 检索 -> 检�索
    '\ue0fe': '们',   # 它们 -> 它�们
    '\ue046': '用',   # 使用 -> 使�用
    '\ue6e7': '如',   # 例如 -> 例�如
}

# Apply replacements
for old, new in replacements.items():
    content = content.replace(old, new)

with open('src/components/workspace/workspace-app.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Replaced PUA characters')
