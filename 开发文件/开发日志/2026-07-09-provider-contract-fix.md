# 2026-07-09 模型来源契约修复记录

## 背景

v0.1 页面提供了 `Custom` 模型来源，但早期实现中它实际被当作 `openai` 处理，类型层和校验层也没有独立的 `custom` provider。这样会造成两个问题：

- 用户看到 `Custom`，但不清楚它到底支持什么协议。
- 前端、手动运行接口、数据库类型之间的 provider 契约不完全一致。

另外，Anthropic 表单允许填写 API URL，但 LLM 路由没有把该 URL 传入 Anthropic SDK。

## 本次修改

- 将 `Provider` 类型扩展为 `openai | anthropic | deepseek | ollama | custom`。
- 将 `manualRunAgentSchema` 依赖的 provider 校验同步支持 `custom`。
- 将 Prisma schema 的 `Provider` enum 同步增加 `custom`，并重新生成 Prisma Client。
- 前端创建智能体页面将 `Custom` 显示为 `Custom OpenAI-compatible`，明确它走 OpenAI Chat Completions 兼容协议。
- LLM 路由中 `custom` 走 OpenAI-compatible client，并使用用户填写的 API URL。
- LLM 路由中 Anthropic 调用现在也会使用用户填写的 API URL。
- README 增加 Custom OpenAI-compatible 示例和边界说明。
- `npm run smoke:manual` 增加 custom provider 场景。

## 已验证

以下命令已经通过：

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run smoke:manual
```

`npm run smoke:manual` 当前覆盖 5 个场景：

- 单个无 API Key Agent 模拟回复。
- 两个启用 Agent 按顺序回复。
- 禁用 Agent 被跳过。
- Custom OpenAI-compatible Agent 能通过手动运行接口校验。
- 错误模型服务返回失败消息，但运行仍然完成。

## 当前结论

`Custom` 现在不是“前端假选项”，而是一个明确的 OpenAI-compatible 自定义模型来源。它仍然不代表任意协议适配，后续如果要支持 Claude-compatible、Gemini、Mistral、火山、硅基流动等专有协议，应继续在 provider 契约里显式建模。

