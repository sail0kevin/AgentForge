# LangChain 集成设计（目标设计）
<!-- 文件名：langchain-integration-design - LangChain集成设计 -->
<!-- 所属目录：design - 产品设计方案 -->

> 状态：**目标设计，部分实现。** 当前项目使用自研 Provider Router、修正后的 TF-IDF和 Zod Tool Registry；`USE_TOOL:`文本协议已删除，Planner授权的结构化只读 Tool已落地。LangGraph产品工作流、评审、人工确认和Checkpoint恢复已进入主链路；统一LangChain组件层与Provider原生 function calling仍是目标。

## 结论：不是“每个 Agent 都加载一套 LangChain”

采用 **独立可调用组件 + 应用级 Registry**：

```text
RunService / LangGraph
  → ModelFactory
  → PromptFactory
  → RetrieverFactory
  → ToolRegistry
  → OutputParser
```

Agent 运行时按 Planner 的授权调用这些组件。可全局复用不可变 Schema、Prompt 元数据和 Tool 定义；绝不能全局保存 API Key、用户身份、对话、临时 Tool 结果或 AbortController。

## 组件与位置

| 组件 | 作用 | 当前迁移起点 |
|---|---|---|
| ModelFactory | 用统一接口构造模型 | `src/lib/llm/router.ts` |
| PromptFactory | 稳定系统约束 + 动态变量 | 当前手工 context 组装 |
| OutputParser | Zod 校验 Planner、报告、评审 | 当前自由文本输出 |
| RetrieverFactory | 提供检索接口 | `src/lib/rag/retrieval.ts` |
| ToolRegistry | schema、权限、超时、审计 | `src/lib/tools/registry.ts` |
| WorkflowFactory | 组装 LangGraph 节点和边 | `src/lib/engine/orchestrator.ts` |
| RunService | 鉴权、预算、持久化、SSE、取消 | 两条现有 run route |

## LangChain 的实际使用点

### Prompt Template

Prompt 将稳定规则与变量分离：

```ts
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "仅基于提供的需求和知识回答；证据不足时明确说明。"],
  ["human", "需求：{requirement}\n知识：{knowledge}\n任务：{task}"],
]);
```

不要把所有历史、所有知识和所有 Agent 输出无差别灌入每个 Agent。只为需要的节点提供少量、相关、可追溯上下文。

### Structured Output

Planner、候选方案、评审、报告目录和工具参数均用 Zod 校验。模型输出不通过 Schema 时，可有限重试；不能直接持久化或显示为已完成。

### Loader / Splitter / Retriever

- Loader：开发阶段导入人工审核过的本地知识资料；
- Splitter：按标题层级切块并保留来源、章节、版本、许可；
- Retriever：首期包装现有 TF-IDF，未来可以替换 embedding/vector store；
- RAG：为节点提供检索片段与引用，而不是替代结构化工具。

### Tool 定义

Tool 用于模型主动请求**受控能力**：UI 评审、组件树建议、可访问性检查、数据模型建议等。每个 Tool 必须有 name、description、Zod input schema、权限、timeout、调用次数和审计记录。

当前 `USE_TOOL:` 是文本解析原型；目标是模型结构化 tool call → 服务端校验 → 执行 → ToolMessage/结构化结果回传 → 继续图节点。

## Tool 与 RAG 的区别

- **RAG**：从稳定或半稳定知识库检索文本片段，为模型提供上下文；
- **Tool**：执行受控的查询、规则判断或确定性计算，输入输出有 Schema；
- 可组合：Tool 调用 Retriever，RAG 为报告提供引用证据。

## Tool 结果边界

模型可见的 `content` 应简短且可序列化；完整表格、引用、UI 卡片和调试数据进入应用侧 artifact/state。并发 Tool 必须通过 `toolCallId` 关联，不能只凭工具名。

## 生命周期与安全

```text
请求进入 → Auth/User scope → 解密当前 Agent credential
→ 创建 RunContext/threadId → 选择组件 → 调用模型/工具
→ 脱敏事件和结果 → Prisma 持久化 → SSE
```

- 模型可按配置缓存，但不得携带用户运行状态；
- Tool 执行必须检查 Agent capability、用户权限、工作区策略和风险等级；
- 所有外部结果必须限制大小、超时和来源；
- 浏览器只收到掩码凭证和安全错误码。

## 迁移顺序

1. [已完成] 用 LangGraph单节点和 RunService统一顺序语义；
2. [已完成] 替换文本工具协议，建立结构化 Planner、知识检索和 Tool审计；
3. [待处理] 让 Planner调度候选任务并引入 Provider原生 function calling；
4. [已完成] 启用评审、人工确认、checkpoint和恢复。

官方参考见 [来源与许可说明](references - 设计参考与许可说明.md)。具体 import、方法和类型必须以安装版本官方文档为准。
