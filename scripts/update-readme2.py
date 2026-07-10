readme = open('README.md', encoding='utf-8').read()

# Find and replace the boundaries section more carefully
start_marker = '## 当前边界'
end_marker = '## 验证命令'

start_idx = readme.find(start_marker)
end_idx = readme.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_boundaries = '''## 当前边界

- Agent 配置、聊天记录和知识片段保存在浏览器 localStorage。
- API Key 现在支持加密存储到 SQLite 数据库（通过系统设置页面管理）。
- 当前使用 SQLite + Prisma 7（通过 libsql 适配器），可切换到 PostgreSQL。
- 长期记忆、语义缓存和工具调用当前主要是能力契约，尚未接入完整执行链路。
- 还没有账号系统、团队权限、审计日志、部署监控和桌面端安装包。

'''
    readme = readme[:start_idx] + new_boundaries + readme[end_idx:]
    open('README.md', 'w', encoding='utf-8').write(readme)
    print('Boundaries section updated')
else:
    print(f'start_idx={start_idx}, end_idx={end_idx}')
