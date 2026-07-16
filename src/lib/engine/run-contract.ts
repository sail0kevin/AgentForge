import { z } from "zod";

const AgentSchema = z.object({
  id: z.string().min(1), name: z.string(), avatar: z.string(), color: z.string(),
  provider: z.enum(["openai", "anthropic", "deepseek", "ollama", "custom"]),
  model: z.string(), systemPrompt: z.string(), temperature: z.number(), maxTokens: z.number().int(),
  capabilityIds: z.array(z.string()).optional(),
});

const MessageSchema = z.object({
  id: z.string().min(1), runId: z.string().optional(),
  role: z.enum(["user", "assistant", "orchestrator"]), agentId: z.string().optional(),
  content: z.string(), createdAt: z.string(), inputTokens: z.number().optional(),
  outputTokens: z.number().optional(), costUsd: z.number().optional(), failed: z.boolean().optional(),
});

const WorkspaceSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), mode: z.enum(["sequential", "debate"]),
  budgetLimit: z.number(), totalSpent: z.number(), status: z.enum(["idle", "running", "warning", "exhausted"]),
  agents: z.array(AgentSchema), messages: z.array(MessageSchema),
});

const base = { version: z.literal(1), runId: z.string().min(1) };

/** 所有运行入口共同使用的 v1 事件协议；新增不兼容字段时必须提升 version。 */
export const RunServiceEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("run_created"), startedAt: z.string() }),
  z.object({ ...base, type: z.literal("workspace_loaded"), workspace: WorkspaceSchema }),
  z.object({ ...base, type: z.literal("user_message_created"), message: MessageSchema }),
  z.object({ ...base, type: z.literal("agent_started"), agent: AgentSchema }),
  z.object({ ...base, type: z.literal("agent_completed"), agent: AgentSchema, message: MessageSchema, totalSpent: z.number(), budgetStatus: z.enum(["idle", "running", "warning", "exhausted"]) }),
  z.object({ ...base, type: z.literal("agent_failed"), agent: AgentSchema, message: MessageSchema, error: z.string(), totalSpent: z.number(), budgetStatus: z.literal("warning") }),
  z.object({ ...base, type: z.literal("budget_exhausted"), totalSpent: z.number(), budgetLimit: z.number() }),
  z.object({ ...base, type: z.literal("run_completed"), totalSpent: z.number(), budgetStatus: z.enum(["idle", "warning", "exhausted"]), errorCode: z.string().optional(), finishedAt: z.string() }),
  z.object({ ...base, type: z.literal("error"), message: z.string(), code: z.string() }),
]);

export type RunServiceEvent = z.infer<typeof RunServiceEventSchema>;

export function parseRunServiceEvent(event: unknown): RunServiceEvent {
  return RunServiceEventSchema.parse(event);
}
