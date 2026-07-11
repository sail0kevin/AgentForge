export type FriendlyError = {
  code: string;
  message: string;
};

/**
 * 将底层 Provider、网络和凭证异常转换为可安全展示的稳定错误。
 * 不透传 SDK 原始错误，避免把请求头、密钥片段或内部地址写进 SSE 和界面。
 */
export function toSafeRunError(error: unknown): FriendlyError {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("CREDENTIAL_NOT_CONFIGURED")) {
    return { code: "CREDENTIAL_NOT_CONFIGURED", message: "该模型供应商尚未配置 API Key，请前往基础设置保存凭证。" };
  }
  if (raw.includes("ENCRYPTION_MASTER_KEY") || raw.includes("decrypt") || raw.includes("Unsupported state")) {
    return { code: "CREDENTIAL_UNAVAILABLE", message: "无法读取该供应商凭证，请在基础设置重新保存 API Key。" };
  }
  if (/401|403|unauthorized|invalid api key/i.test(raw)) {
    return { code: "PROVIDER_AUTH_FAILED", message: "模型供应商拒绝了凭证，请检查 API Key 和权限。" };
  }
  if (/404|model.*not found|not_found/i.test(raw)) {
    return { code: "MODEL_NOT_FOUND", message: "找不到所选模型，请检查模型名称和供应商地址。" };
  }
  if (raw.includes("PERSISTENCE_UNAVAILABLE") || /foreign key|database|prisma/i.test(raw)) {
    return { code: "PERSISTENCE_UNAVAILABLE", message: "无法保存本次运行结果，请检查数据库后重试。" };
  }
  if (/timeout|timed out/i.test(raw)) {
    return { code: "PROVIDER_TIMEOUT", message: "模型响应超时，已跳过当前智能体并继续后续任务。" };
  }
  if (/ECONNREFUSED|fetch failed|network/i.test(raw)) {
    return { code: "PROVIDER_UNAVAILABLE", message: "无法连接模型供应商，请检查网络、服务地址或 Ollama 是否已启动。" };
  }
  return { code: "PROVIDER_REQUEST_FAILED", message: "模型调用失败，请稍后重试或检查基础设置。" };
}
