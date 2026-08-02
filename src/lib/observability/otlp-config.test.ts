import test from "node:test";
import assert from "node:assert/strict";
import { resolveOtlpTraceConfig } from "./otlp-config";

test("OTLP trace export stays disabled without an explicit endpoint", () => {
  assert.equal(resolveOtlpTraceConfig({}), null);
  assert.equal(resolveOtlpTraceConfig({ AGENTFORGE_OTLP_TRACES_ENDPOINT: "   " }), null);
});

test("OTLP trace export accepts an explicit HTTP endpoint and safe resource labels", () => {
  assert.deepEqual(resolveOtlpTraceConfig({
    AGENTFORGE_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
    OTEL_SERVICE_NAME: "agentforge-staging",
    AGENTFORGE_RELEASE_VERSION: "2026.08.01",
  }), {
    endpoint: "http://127.0.0.1:4318/v1/traces",
    serviceName: "agentforge-staging",
    serviceVersion: "2026.08.01",
  });
});

test("OTLP trace export rejects unsupported endpoint protocols", () => {
  assert.equal(resolveOtlpTraceConfig({ AGENTFORGE_OTLP_TRACES_ENDPOINT: "file:///tmp/traces" }), null);
  assert.equal(resolveOtlpTraceConfig({ AGENTFORGE_OTLP_TRACES_ENDPOINT: "collector.internal:4318/v1/traces" }), null);
});
