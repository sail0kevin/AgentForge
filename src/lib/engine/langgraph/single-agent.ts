import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import type { AgentConfig, LLMMessage, LLMResult } from "@/lib/types";

// 图模块只保留调用模型所需的 Agent 字段，避免把凭证或数据库记录带入图状态。
const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string(),
  color: z.string(),
  provider: z.enum(["openai", "anthropic", "deepseek", "ollama", "custom"]),
  model: z.string().min(1),
  systemPrompt: z.string(),
  temperature: z.number(),
  maxTokens: z.number().int().positive(),
  capabilityIds: z.array(z.string()).optional(),
});

// 前序结论需要带上 Agent 名称，后续模型才能知道内容来自谁。
const PriorAssistantMessageSchema = z.object({
  agentName: z.string().min(1),
  content: z.string().min(1),
});

// 对外输入在进入图前校验，空需求不会触发检索或模型调用。
export const SingleAgentGraphInputSchema = z.object({
  agent: AgentSchema,
  input: z.string().trim().min(1),
  // systemContext 由已授权的应用层拼装，图模块不需要了解 capability、数据库或凭证实现。
  systemContext: z.string(),
  userId: z.string().min(1).optional(),
  priorAssistantMessages: z.array(PriorAssistantMessageSchema).default([]),
});

// 检索器只能返回文本上下文；具体实现可以是 TF-IDF、片段或未来的向量检索。
const RetrievedContextSchema = z.string();

// 统一校验模型调用结果，避免不完整输出进入后续持久化层。
export const LLMResultSchema = z.object({
  content: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

// 图完成后对外暴露的安全结果不包含凭证、Provider 原始响应或内部图对象。
export const SingleAgentGraphResultSchema = LLMResultSchema.extend({
  retrievedContext: z.string(),
});

export type SingleAgentGraphInput = z.infer<typeof SingleAgentGraphInputSchema>;
export type SingleAgentGraphResult = z.infer<typeof SingleAgentGraphResultSchema>;
export type PriorAssistantMessage = z.infer<typeof PriorAssistantMessageSchema>;

export type SingleAgentGraphDependencies = {
  // 检索依赖按图实例注入，防止用户上下文和数据访问范围在全局泄漏。
  retrieveContext: (input: SingleAgentGraphInput) => Promise<string>;
  // 模型调用依赖同样注入，后续可适配现有 provider-neutral router。
  invokeAgent: (input: { agent: AgentConfig; messages: LLMMessage[] }) => Promise<LLMResult>;
};

// LangGraph State 只保存节点间传递的最小数据，不承担产品级 Run 或 Checkpoint 持久化。
const SingleAgentGraphState = Annotation.Root({
  agent: Annotation<AgentConfig>,
  input: Annotation<string>,
  systemContext: Annotation<string>,
  userId: Annotation<string | undefined>,
  priorAssistantMessages: Annotation<PriorAssistantMessage[]>(),
  retrievedContext: Annotation<string>(),
  result: Annotation<LLMResult | undefined>,
});

type SingleAgentGraphStateType = typeof SingleAgentGraphState.State;

function buildMessages(state: SingleAgentGraphStateType): LLMMessage[] {
  const systemParts = [state.systemContext];

  // 无命中时不插入空上下文提示，保持与普通模型调用相同的 Prompt 语义。
  if (state.retrievedContext.trim()) {
    systemParts.push(`【检索到的参考资料】\n${state.retrievedContext}`);
  }

  const messages: LLMMessage[] = [
    { role: "system", content: systemParts.filter(Boolean).join("\n\n") },
    { role: "user", content: state.input },
  ];

  for (const previous of state.priorAssistantMessages) {
    messages.push({
      role: "user",
      content: `[Previous agent ${previous.agentName}]: ${previous.content}`,
    });
  }

  return messages;
}

/**
 * 创建最小单 Agent LangGraph。
 *
 * 该图是第一阶段的独立基础设施：只验证 StateGraph、检索上下文和模型调用的边界。
 * 当前 HTTP 路由、SSE、Prisma 持久化和多 Agent 顺序循环仍继续使用旧实现。
 */
export function createSingleAgentGraph(dependencies: SingleAgentGraphDependencies) {
  const retrieveContext = async (state: SingleAgentGraphStateType) => {
    const input = SingleAgentGraphInputSchema.parse({
      agent: state.agent,
      input: state.input,
      systemContext: state.systemContext,
      userId: state.userId,
      priorAssistantMessages: state.priorAssistantMessages,
    });

    const retrievedContext = RetrievedContextSchema.parse(await dependencies.retrieveContext(input));
    return { retrievedContext };
  };

  const invokeAgent = async (state: SingleAgentGraphStateType) => {
    const result = LLMResultSchema.parse(
      await dependencies.invokeAgent({
        agent: state.agent,
        messages: buildMessages(state),
      })
    );

    return { result };
  };

  return new StateGraph(SingleAgentGraphState)
    .addNode("retrieveContext", retrieveContext)
    .addNode("invokeAgent", invokeAgent)
    .addEdge(START, "retrieveContext")
    .addEdge("retrieveContext", "invokeAgent")
    .addEdge("invokeAgent", END)
    .compile();
}

/**
 * 给应用层使用的简化入口。
 *
 * 先在图外校验输入，确保无效请求不会让任意节点或注入依赖开始执行。
 */
export async function runSingleAgentGraph(
  dependencies: SingleAgentGraphDependencies,
  rawInput: SingleAgentGraphInput
): Promise<SingleAgentGraphResult> {
  const input = SingleAgentGraphInputSchema.parse(rawInput);
  const graph = createSingleAgentGraph(dependencies);
  const state = await graph.invoke(input);

  return SingleAgentGraphResultSchema.parse({
    ...state.result,
    retrievedContext: state.retrievedContext,
  });
}
