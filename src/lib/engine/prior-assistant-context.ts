export type PriorAssistantContextMessage = {
  agentName: string;
  content: string;
};

export type PriorAssistantContextLimits = {
  maxMessages: number;
  maxCharacters: number;
  maxCharactersPerMessage: number;
};

export const PRIOR_ASSISTANT_CONTEXT_LIMITS = {
  maxMessages: 8,
  maxCharacters: 12_000,
  maxCharactersPerMessage: 2_000,
} as const;

const TRUNCATION_SUFFIX = "\n[前序 Agent 输出已截断]";

function truncateMessageContent(content: string, maxCharacters: number) {
  if (content.length <= maxCharacters) return content;
  if (maxCharacters <= TRUNCATION_SUFFIX.length) return content.slice(0, maxCharacters);
  return `${content.slice(0, maxCharacters - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

/**
 * 控制跨 Agent 传递的历史上下文：优先保留最新结论，并对单条和总量同时设限。
 * 字符数是稳定的本地保护阈值，不把它伪装成任意 Provider 的精确 token 数。
 */
export function limitPriorAssistantContext(
  messages: PriorAssistantContextMessage[],
  limits: PriorAssistantContextLimits = PRIOR_ASSISTANT_CONTEXT_LIMITS,
): PriorAssistantContextMessage[] {
  const selected: PriorAssistantContextMessage[] = [];
  let usedCharacters = 0;

  for (let index = messages.length - 1; index >= 0 && selected.length < limits.maxMessages; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    const content = truncateMessageContent(message.content, limits.maxCharactersPerMessage);
    // 提示词中的角色标签也会占用上下文，因此同样纳入总字符预算。
    const messageCharacters = message.agentName.length + content.length + 24;
    if (usedCharacters + messageCharacters > limits.maxCharacters) continue;

    selected.unshift({ agentName: message.agentName, content });
    usedCharacters += messageCharacters;
  }

  return selected;
}
