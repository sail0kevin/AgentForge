# OpenTelemetry 可观测性边界

更新时间：2026-07-31（Asia/Shanghai）

## 已实现

- 使用 `@opentelemetry/api` 建立本地 span 适配层；未注册 OTel SDK 时为 no-op，不发送网络请求。
- 默认 OTel 适配器会在当前 span 的活动上下文中执行回调，因此同一进程内的 Agent span 可以继承 Run span 的父子关系；注入式测试适配器可选择不提供上下文能力。
- 顺序工作区在 `RunService` 记录 `agentforge.workspace.run` 与每个 `agentforge.workspace.agent` span。
- Agent span 记录实际返回的输入 token、输出 token 与基于当前计价表计算的 USD 成本；Run span 记录累计成本、预算状态与规范化错误码。
- 产品 LangGraph 的 `create_plan`、`clarification`、`cross_review`、`human_approval`、`generate_report`、`finalize` 六个节点均通过统一包装器创建和关闭 `agentforge.workflow.node` span。
- span 属性不包含需求正文、Prompt、模型输出、原始异常消息、RAG 内容或凭据。
- Node.js 运行时在显式设置 `AGENTFORGE_OTLP_TRACES_ENDPOINT` 后，使用 OTLP/HTTP Exporter 注册 `NodeSDK`；未设置时保持 no-op，不创建 SDK 或网络连接。
- 配置只接受 `http:` 或 `https:` endpoint；服务名默认 `agentforge`，可选的版本属性仅来自 `AGENTFORGE_RELEASE_VERSION`。Next 开发模式使用进程全局 SDK 单例，避免热重载重复注册 Provider。

## 已验证

- `src/lib/engine/run-service.test.ts` 验证 Run/Agent span 会关闭，并且 token 与成本属性来自测试调用的实际 `LLMResult`。
- `src/lib/engine/run-service.test.ts` 验证支持上下文的 TraceProvider 会包裹 Run 与嵌套 Agent 回调，防止默认 OTel 适配器将它们导出为无关平级 span。
- `src/lib/workflow/product-graph.test.ts` 验证完整工作流的四个已执行节点会关闭 span，且需求文本不会写入 span 属性。
- `src/lib/observability/otlp-config.test.ts` 验证默认关闭、HTTP endpoint 解析和不支持协议拒绝；该测试已纳入 `npm run test:unit`。
- 2026-08-01 本地通过 `npm run typecheck`、`npm run lint`、`npm run test:unit` 与生产构建；这只验证代码和配置边界。

## 待实测

- 真实 Provider 调用下的 token、端到端时延与成本分布。
- OTLP Exporter 与 Jaeger、Grafana Tempo 或其他 Collector 的实际连通性、鉴权、采样和告警策略。
- 跨进程 trace context 传播与生产环境的属性脱敏审计。

## 目标设计

- 在明确可观测性后端、数据保留期限、采样比例和隐私策略后，部署并验收外部 Collector。
- 将工作流 span 与 Provider、检索、工具调用 span 关联为同一 trace，并基于真实数据建立性能和成本回归门禁。
