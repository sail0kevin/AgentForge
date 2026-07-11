# Contributing

1. 从 `.env.example` 创建本地 `.env`，不要提交真实 API Key、数据库或测试产物。
2. 保持每次修改聚焦在一个功能或缺陷。
3. 提交前运行：

```bash
npm run test:e2e:core
npm run build
```

4. 新增 Agent 或模型连接逻辑时，确保原始 API Key 不会出现在 API 响应、浏览器状态、SSE 或日志中。
