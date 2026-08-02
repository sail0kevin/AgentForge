import { context, SpanStatusCode, trace, type Span } from "@opentelemetry/api";

export type TraceAttribute = string | number | boolean;
export type TraceAttributes = Record<string, TraceAttribute | undefined>;
export type TraceSpan = Pick<Span, "end" | "setAttribute" | "setStatus">;

export type TraceProvider = {
  startSpan: (name: string, attributes?: TraceAttributes) => TraceSpan;
  /** 将回调置于 span 的活动上下文中，供默认 OTel 实现保留父子关系。 */
  runWithSpan?: <T>(span: TraceSpan, run: () => Promise<T> | T) => Promise<T> | T;
};

const defaultProvider: TraceProvider = {
  startSpan: (name, attributes) => {
    const span = trace.getTracer("agentforge").startSpan(name);
    for (const [key, value] of Object.entries(attributes ?? {})) {
      if (value !== undefined) span.setAttribute(key, value);
    }
    return span;
  },
  runWithSpan: (span, run) => context.with(trace.setSpan(context.active(), span as Span), run),
};

export function getDefaultTraceProvider(): TraceProvider {
  return defaultProvider;
}

/**
 * 统一记录可安全公开的 span 元数据。未注册 OTel SDK 时默认 API 为 no-op，
 * 所以本地开发不会因尚未接入 Jaeger 或 Tempo 而产生网络请求。
 */
export async function traceAsync<T>(input: {
  provider?: TraceProvider;
  name: string;
  attributes?: TraceAttributes;
  run: (span: TraceSpan) => Promise<T> | T;
}): Promise<T> {
  const provider = input.provider ?? defaultProvider;
  const span = provider.startSpan(input.name, input.attributes);
  const startedAt = performance.now();
  try {
    // 默认实现会把子操作绑定到当前 span；测试替身可省略该能力。
    const result = await (provider.runWithSpan?.(span, () => input.run(span)) ?? input.run(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    // 不写入原始异常消息，避免 Prompt、模型输出或凭据被意外导出。
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.setAttribute("agentforge.duration_ms", Math.round(performance.now() - startedAt));
    span.end();
  }
}
