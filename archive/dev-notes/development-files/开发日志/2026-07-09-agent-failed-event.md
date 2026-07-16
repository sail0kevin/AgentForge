# 2026-07-09 Agent 失败事件契约收紧

## 背景

v0.1 之前把 Agent 模型调用失败伪装成 `agent_completed` 发出，前端虽然能在聊天区展示失败气泡，但事件语义不清晰。这样有两个问题：

- 成功和失败共用一种事件类型，后续做统计、回放或告警时会分不清楚。
- 测试只能断言“有完成消息”，不能断言“明确发出了失败事件”。

## 本次修改

- RunEvent 增加 `agent_failed` 类型，用于区分成功和失败。
- 前端 `workspace-store.ts` 让 `agent_failed` 同样追加 assistant 消息，但同时把 `error` 写入 store，方便 UI 显示失败状态。
- `src/app/api/workspaces/manual/run/route.ts` 在 Agent 调用失败时发出 `agent_failed`，并继续处理后续 Agent。
- `npm run smoke:manual` 的失败场景改为断言 `agent_failed` 事件存在，并要求失败 Agent 的 content 包含失败原因。
- README 与 v0.1 开发计划同步补充了 `agent_failed` 的语义说明。

## 当前已验证

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run smoke:manual
```

后续可在 UI 层面进一步把 `store.error` 渲染成运行级提示，而不只是单个 Agent 的失败气泡。

