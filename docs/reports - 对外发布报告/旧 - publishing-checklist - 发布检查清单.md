# AgentForge 公开发布检查清单
<!-- 文件名：publishing-checklist - 发布检查清单 -->
<!-- 所属目录：reports - 对外发布报告 -->

## 不得提交

- `.env`、`.env.*`（`.env.example` 除外）
- `prisma/dev.db`、任何 `.db` / `.sqlite` 文件
- 真实 API Key、Session Secret、Encryption Master Key
- `.next/`、`node_modules/`、`test-results/`、`playwright-report/`
- `.claude/`、日志、临时验证截图
- `local-only/` 下的简历、面试稿和个人材料

## 提交前检查

```bash
git status --short
git diff --stat
git diff
git ls-files .env
node --env-file=.env scripts/verify-secret-hygiene.mjs --production
npm run quality:all
git diff --check
```

## GitHub 发布前

- 确认 README、Demo、Architecture、Project Report 和 `docs/design/` 链接可打开；
- 确认公开文案区分“当前产品级Web MVP”“保留的自由双Agent入口”和“尚未完成的真实模型质量实验”；
- 确认RAG只描述为TF-IDF；不得写成Embedding、RRF或向量数据库；
- 确认盲评dry-run标明 `synthetic: true`、`modelCalled: false`，不得包装成真实模型质量结论；
- 确认Checkpoint只描述为本地SQLite能力，Provider原生Tool Calling、共享Checkpointer、PDF/DOCX和Electron正式交付仍标为未完成；
- 确认README中的仓库检索目标标题未被删除，并重新执行 `npm run quality:rag:repository`；
- 确认两个默认 Agent 与演示流程可运行；
- 确认 Agent 编辑页只展示 Key 掩码；
- 如加入截图，确认截图不含密钥、个人资料、本机绝对路径、调试信息，并已在 README 正确引用；
- 如加入视频或部署链接，确认链接真实可访问；未准备时不写占位链接；
- 确认 `local-only/` 继续被 Git 忽略；
- 确认 `git ls-files .env` 无输出，隔离 E2E 不读取 `prisma/dev.db`；
- 如果 `.env` 过去进入过 Git 历史，在 Provider 后台轮换真实 Key 和本地 Secrets；之后运行密钥卫生命令并只记录通过状态、日期和操作者，绝不记录实际值；
- 推送前确认 remote 指向 `https://github.com/sail0kevin/AgentForge.git`；
- 不使用 force push。
