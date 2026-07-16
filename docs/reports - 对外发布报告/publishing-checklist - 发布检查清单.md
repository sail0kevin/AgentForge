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
git ls-files .env
node --env-file=.env scripts/verify-secret-hygiene.mjs --production
npx prisma validate --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.postgres.prisma
npm run test:unit
npm run test:e2e:core
npm run test:e2e:session
npm run lint
npm run build
```

## GitHub 发布前

- 确认 README、Demo、Architecture、Project Report 和 `docs/design/` 链接可打开；
- 确认公开文案把“当前双 Agent MVP”和“后续 LangGraph/Tool Calling 设计”明确区分；
- 确认0.1只声明Web MVP；Electron仍为实验壳，不提供未经干净机器验收的桌面安装包声明；
- 确认两个默认 Agent 与演示流程可运行；
- 确认 Agent 编辑页只展示 Key 掩码；
- 如加入截图，确认截图不含密钥、个人资料、本机绝对路径、调试信息，并已在 README 正确引用；
- 如加入视频或部署链接，确认链接真实可访问；未准备时不写占位链接；
- 确认 `local-only/` 继续被 Git 忽略；
- 确认 `git ls-files .env` 无输出，隔离 E2E 不读取 `prisma/dev.db`；
- 如果 `.env` 过去进入过 Git 历史，在 Provider 后台轮换真实 Key 和本地 Secrets；之后运行密钥卫生命令并只记录通过状态、日期和操作者，绝不记录实际值；
- 推送前确认 remote 指向 `https://github.com/sail0kevin/AgentForge.git`；
- 不使用 force push。
