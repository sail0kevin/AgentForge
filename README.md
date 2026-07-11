# Multi-Agent Workspace

一个本地优先的 **顺序式多 Agent 协作工作台**。多个 Agent 在同一对话中依次分析任务，后续 Agent 可读取前序结论并生成结构化开发报告。

> 当前是用于学习、演示和简历展示的 Web MVP，不是生产级公网服务。

## 核心亮点

- **多 Agent 协作**：支持“需求分析师 → 开发报告负责人”的顺序讨论与上下文传递。
- **实时可观测**：通过 SSE 推送 Agent 开始、完成、失败等运行事件；单个失败不阻塞后续 Agent。
- **用户自带模型**：每个 Agent 可配置自己的 API URL、模型名和 API Key，支持 Ollama 与 OpenAI-compatible 接口。
- **凭证安全**：API Key 使用 AES-256-GCM 加密保存；接口、浏览器状态和 SSE 只保留掩码信息。
- **工程闭环**：消息持久化、刷新恢复、清空不复活、轻量 TF-IDF RAG、Playwright 核心 E2E。

## 快速开始：Ollama 双 Agent 演示

### 1. 准备本地模型

```bash
ollama pull qwen2.5:3b
ollama serve
```

### 2. 启动项目

```bash
cp .env.example .env
npm install
npx prisma db push
npx prisma generate
npm run dev
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

打开 [http://localhost:3000](http://localhost:3000)。本地演示推荐保留 `.env` 中的：

```env
APP_AUTH_MODE="local"
OLLAMA_BASE_URL="http://localhost:11434"
```

项目会使用两个默认 Agent：

1. **需求分析师**：拆解目标、限制、验收与风险；
2. **开发报告负责人**：读取前序分析，输出方案、任务、测试和下一步。

更多演示步骤见 [Demo Guide](docs/demo.md)。

## 质量验证

```bash
npm run test:e2e:core
npm run build
```

核心 E2E 覆盖：

- API Key 不泄漏；
- Agent 失败后继续执行；
- 聊天历史恢复与清空；
- 主题和语言刷新持久化。

## 技术栈

`Next.js` · `React` · `TypeScript` · `Prisma` · `SQLite` · `Zustand` · `SSE` · `Playwright` · `Ollama` / OpenAI Compatible API

## 项目边界

- 当前 RAG 是 TF-IDF 轻量检索，未接入 embedding / pgvector；
- 已提供工具注册与执行 API，完整模型 Tool Calling 循环尚未实现；
- 提供 Electron shell 与打包脚本，但本版本以 Web MVP 为主，未完成桌面端最终验收；
- `local` 用于本机开发，公网或多用户部署应使用 `APP_AUTH_MODE=session` 并配置强随机密钥。

## 文档

- [架构说明](docs/architecture.md)
- [当前状态与已知限制](docs/current-status.md)
- [演示指南](docs/demo.md)
- [项目报告](docs/reports/project-report.md)
- [公开发布检查清单](docs/reports/publishing-checklist.md)
- [贡献说明](CONTRIBUTING.md)

## 安全提醒

不要提交 `.env`、SQLite 数据库、真实 API Key 或测试产物。如果 `.env` 曾被提交到 Git 历史，请在对应 Provider 后台轮换 API Key、`SESSION_SECRET` 与 `ENCRYPTION_MASTER_KEY`。

## License

[MIT](LICENSE)
