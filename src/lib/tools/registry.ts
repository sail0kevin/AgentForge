export type ToolResult = { output: string };

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  tools.set(tool.id, tool);
}

export function getTool(id: string): Tool | undefined {
  return tools.get(id);
}

export function getAllTools(): Tool[] {
  return Array.from(tools.values());
}

/**
 * Build a function-call style prompt for the LLM from the given tool IDs.
 */
export function buildToolPrompt(toolIds: string[]): string {
  const selected = toolIds.map(getTool).filter((t): t is Tool => Boolean(t));
  if (selected.length === 0) return "";
  const toolList = selected
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
  return `You have access to the following tools:\n${toolList}\n\nTo use a tool, respond with: USE_TOOL: <tool_id> {"param": "value"}`;
}

/**
 * Parse a tool-use instruction from LLM text.
 */
export function parseToolUse(text: string): { toolId: string; input: Record<string, unknown> } | null {
  const match = text.match(/^USE_TOOL:\s*([\w-]+)\s*(\{.*\})?/);
  if (!match) return null;
  let input: Record<string, unknown> = {};
  try {
    if (match[2]) input = JSON.parse(match[2]);
  } catch { /* ignore parse error */ }
  return { toolId: match[1], input };
}
