import { registerTool, type Tool } from "./registry";

/**
 * Web Search stub - future integration point for real web search APIs.
 * Currently returns a simulated acknowledgment.
 */
const webSearchTool: Tool = {
  id: "web_search",
  name: "Web Search",
  description: "Search the web for information. Placeholder — requires search API key.",
  parameters: [
    { name: "query", type: "string", description: "The search query", required: true },
  ],
  async execute(input) {
    return { output: `[Web Search] Searched for: "${String(input?.query ?? "")}". (API key not configured)` };
  },
};

/**
 * Calculator tool - evaluates simple math expressions safely.
 */
const calculatorTool: Tool = {
  id: "calculator",
  name: "Calculator",
  description: "Evaluate simple math expressions. Supports +, -, *, /, parentheses, sqrt, pow.",
  parameters: [
    { name: "expression", type: "string", description: "Math expression, e.g. (2 + 3) * 4", required: true },
  ],
  async execute(input) {
    try {
      const expr = String(input?.expression ?? "").replace(/[^0-9+\-*/().,^%\s]/g, "");
      if (!expr.trim()) return { output: "Invalid expression" };
      // Use Function constructor with strict whitelist
      const sanitized = expr.replace(/sqrt/gi, "Math.sqrt").replace(/pow/gi, "Math.pow").replace(/\^/g, "**");
      const result = new Function(`"use strict"; return (${sanitized});`)();
      return { output: `${expr} = ${result}` };
    } catch {
      return { output: "Failed to evaluate expression" };
    }
  },
};

/**
 * Date and time tool
 */
const datetimeTool: Tool = {
  id: "datetime",
  name: "Date Time",
  description: "Get current date and time in the specified timezone.",
  parameters: [
    { name: "timezone", type: "string", description: "Timezone (default: Asia/Shanghai)", required: false },
  ],
  async execute(input) {
    const tz = String(input?.timezone ?? "Asia/Shanghai");
    try {
      const now = new Date();
      const formatted = now.toLocaleString("zh-CN", { timeZone: tz });
      return { output: `Current time (${tz}): ${formatted}` };
    } catch {
      return { output: new Date().toISOString() };
    }
  },
};

/**
 * Knowledge base search (uses RAG)
 */
const knowledgeSearchTool: Tool = {
  id: "knowledge_search",
  name: "Knowledge Search",
  description: "Search the local knowledge base for relevant information.",
  parameters: [
    { name: "query", type: "string", description: "The search query", required: true },
  ],
  async execute(input) {
    return { output: `[Knowledge Search] Query: "${String(input?.query ?? "")}" — RAG module handles full pipeline.` };
  },
};

export function initBuiltInTools(): void {
  registerTool(webSearchTool);
  registerTool(calculatorTool);
  registerTool(datetimeTool);
  registerTool(knowledgeSearchTool);
}

export const BUILTIN_TOOL_IDS = ["web_search", "calculator", "datetime", "knowledge_search"];
