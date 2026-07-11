# AgentForge 公开发布检查清单

## 不得提交

- `.env`、`.env.*`（`.env.example` 除外）
- `prisma/dev.db`、任何 `.db` / `.sqlite` 文件
- 真实 API Key、Session Secret、Encryption Master Key
- `.next/`、`node_modules/`、`test-results/`、`playwright-report/`
- `.claude/`、日志、临时验证截图

## 提交前检查

```bash
git status --short
npx prisma validate --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.postgres.prisma
npm run test:e2e:core
npm run build
```

## GitHub 发布前

- 确认 README、Demo、Architecture、Project Report 链接可打开；
- 确认两个默认 Agent 与演示流程可运行；
- 确认 Agent 编辑页只展示 Key 掩码；
- 如果 `.env` 过去进入过 Git 历史，在 Provider 后台轮换真实 Key 和本地 Secrets；
- 推送前确认 remote 指向 `https://github.com/sail0kevin/AgentForge.git`；
- 不使用 force push。
