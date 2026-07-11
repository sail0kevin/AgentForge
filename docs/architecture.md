# AgentForge 核心架构

## 1. 手动运行

前端只发送用户输入、Agent ID、RAG 开关和本地知识片段。服务端根据当前用户加载 Agent 配置及 Provider 凭证，浏览器不能覆盖 system prompt、provider 或 API Key。

每个 Agent 按请求中的 ID 顺序执行。前序回复会以真实 Agent 名称写入后续上下文。单个 Agent 失败时保存失败消息并发送 `agent_failed`，然后继续执行队列。

## 2. 持久工作区

运行前以 `workspaceId + userId` 锁定资源，防止跨用户执行和同一工作区重复运行。Agent 成功后保存 Message 和 TokenUsage；失败后保存可恢复的失败消息。finally 确保状态不会永久停在 running。

## 3. 凭证边界

ApiKey 表是持久凭证的唯一来源。数据库使用 AES-256-GCM 密文；Agent DTO 只返回 `credentialConfigured` 和 `maskedKey`。远程 Provider 没有 Key 时稳定失败，Ollama 走本地 HTTP。

## 4. SSE 事件

核心事件：

- `user_message_created`
- `agent_started`
- `agent_completed`
- `agent_failed`
- `budget_exhausted`
- `run_completed`
- `error`

前端不得在网络错误时伪造 `agent_completed`。

## 5. RAG

v0.1 使用 TF-IDF。文档严格按当前 userId 检索，损坏的单条 metadata 会回退为空对象，不应使全部检索失败。

## 6. 测试边界

`e2e/core.spec.ts` 使用不可达的本地 Ollama 地址制造确定性失败，不调用真实收费 Provider。它验证凭证不泄漏、失败继续、事件顺序、历史恢复/清空和偏好持久化。
