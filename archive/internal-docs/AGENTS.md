<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-Agent Workspace 导航

## 当前目标

完成用于学习、测试和展示的多 Agent Web 版本。优先保留顺序编排、前序输出传递、SSE、服务端凭证、消息持久化和轻量 RAG；外围功能采用最小实现。

## 核心调用链

- 手动聊天：`workspace-app.tsx` → `/api/workspaces/manual/run` → 服务端加载 Agent/凭证 → Provider → Message/TokenUsage → SSE。
- 持久工作区：`/api/workspaces/[id]/run` → `runPersistentWorkspace()` → 顺序执行；单 Agent 失败后继续。
- RAG：当前用户 DocumentChunk → TF-IDF → Agent system context。

## 不可破坏的约束

- 原始 API Key 不得进入 Agent.config、API DTO、浏览器状态、manual-run 请求或 SSE。
- 远程 Provider 缺 Key 必须返回 `CREDENTIAL_NOT_CONFIGURED`，不能静默模拟成功；Ollama 可无 Key。
- Session 模式不能回退共享默认用户，所有用户资源按 userId 隔离。
- 成功回复与 TokenUsage 原子保存；持久化失败不能伪装成功。
- 单 Agent 失败后继续后续 Agent，最终必须离开 running。
- 不执行 `git reset`、`git clean`、`git add -A`，不覆盖无关历史修改。
- 关键新增代码添加初学者能理解的中文注释。

## 验证

```bash
npm run test:e2e:core
npx prisma validate --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.postgres.prisma
npm run build
```

## 当前不做

PostgreSQL/pgvector 实际部署、完整 Tool Calling、生产级账号系统、Electron 正式打包、非必要 UI 大重构。
