import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resolveOtlpTraceConfig } from "@/lib/observability/otlp-config";

declare global {
  // Next 开发模式可能重载 instrumentation；全局单例避免重复注册 TracerProvider。
  var __agentforgeOtelSdk: NodeSDK | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || globalThis.__agentforgeOtelSdk) return;
  const config = resolveOtlpTraceConfig();
  if (!config) return;

  const sdk = new NodeSDK({
    serviceName: config.serviceName,
    resource: resourceFromAttributes({
      "service.name": config.serviceName,
      ...(config.serviceVersion ? { "service.version": config.serviceVersion } : {}),
    }),
    traceExporter: new OTLPTraceExporter({ url: config.endpoint }),
  });
  sdk.start();
  globalThis.__agentforgeOtelSdk = sdk;
}
