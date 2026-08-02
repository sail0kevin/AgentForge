export type OtlpTraceConfig = {
  endpoint: string;
  serviceName: string;
  serviceVersion?: string;
};

type Environment = Record<string, string | undefined>;

/**
 * 仅在显式提供 HTTP(S) OTLP endpoint 时启用导出。
 * 默认返回 null，保证本地开发和测试不会因 tracing 产生网络请求。
 */
export function resolveOtlpTraceConfig(environment: Environment = process.env): OtlpTraceConfig | null {
  const rawEndpoint = environment.AGENTFORGE_OTLP_TRACES_ENDPOINT?.trim();
  if (!rawEndpoint) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null;

  const serviceName = environment.OTEL_SERVICE_NAME?.trim() || "agentforge";
  const serviceVersion = environment.AGENTFORGE_RELEASE_VERSION?.trim();
  return { endpoint: endpoint.toString(), serviceName, ...(serviceVersion ? { serviceVersion } : {}) };
}
