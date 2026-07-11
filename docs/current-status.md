# AgentForge 当前开发状态

更新时间：2026-07-11

## 当前目标

交付一个以多 Agent 技术为核心、外围最简的可测试 Web 版本。

## 已完成

- 多 Agent 顺序执行和前序输出传递
- 单 Agent 失败后继续后续 Agent
- SSE 运行事件和错误脱敏
- 消息刷新恢复与清空
- Agent 能力配置和轻量 TF-IDF RAG
- Session/local 身份模式与核心用户隔离
- API Key 服务端加密、掩码 DTO 和浏览器防泄漏
- 手动运行成功消息与 TokenUsage 原子持久化
- 主题和语言刷新持久化
- 核心 Playwright 验收（4 项）
- SQLite/PostgreSQL Prisma schema 静态校验
- Next.js 生产构建

## 核心验收命令

```bash
npm run test:e2e:core
npm run build
```

## 已知限制

- RAG 仍为 TF-IDF，不是 embedding/pgvector。
- 工具 API 存在，但未接入完整模型 Tool Calling 循环。
- Electron 壳存在，但本轮未作为完成条件打包验收。
- 完整全项目 lint 仍受大型旧组件和 CommonJS 脚本的历史问题影响；核心运行文件定向 lint 已通过。
- 构建仍有 `next.config.ts → src/lib/db.ts` 的 Turbopack NFT tracing warning，但不阻塞构建。
- Provider 请求超时/客户端断开取消仍可进一步增强。
- `.env` 曾被 Git 跟踪，历史真实密钥需要在对应服务商后台人工轮换。

## 后续可选工作

1. Provider 超时和 SSE 断开取消。
2. 完整 Tool Calling runtime。
3. PostgreSQL + pgvector。
4. Electron Windows 打包。
5. 生产级限流、监控、备份和恢复。
