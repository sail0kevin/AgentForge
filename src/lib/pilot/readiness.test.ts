import assert from "node:assert/strict";
import test from "node:test";
import { assessPilotReadiness } from "./readiness";

const secret = "a".repeat(48);

test("production readiness requires session, PostgreSQL and explicit checkpoint settings", () => {
  const result = assessPilotReadiness(
    {
      APP_AUTH_MODE: "session",
      SESSION_SECRET: secret,
      ENCRYPTION_MASTER_KEY: secret,
      DATABASE_URL: "postgresql://pilot:pilot@localhost:5432/agentforge",
      WORKFLOW_CHECKPOINT_BACKEND: "postgres",
      WORKFLOW_CHECKPOINT_AUTO_SETUP: "false",
    },
    "production",
  );

  assert.equal(result.ready, true);
  assert.equal(result.checks.some((check) => check.status === "fail"), false);
});

test("production readiness rejects local and placeholder configuration", () => {
  const result = assessPilotReadiness(
    {
      APP_AUTH_MODE: "local",
      SESSION_SECRET: "replace-with-a-long-random-session-secret",
      ENCRYPTION_MASTER_KEY: "short",
      DATABASE_URL: "file:./prisma/dev.db",
      WORKFLOW_CHECKPOINT_BACKEND: "",
      WORKFLOW_CHECKPOINT_AUTO_SETUP: "true",
    },
    "production",
  );

  assert.equal(result.ready, false);
  assert.ok(result.checks.filter((check) => check.status === "fail").length >= 5);
  assert.match(result.checks.find((check) => check.name === "session-secret")?.message ?? "", /示例值/);
});

test("development readiness reports a temporary secret as a warning without failing", () => {
  const result = assessPilotReadiness(
    {
      APP_AUTH_MODE: "local",
      NODE_ENV: "development",
      ENCRYPTION_MASTER_KEY: "replace-with-a-strong-random-encryption-secret",
    },
    "development",
  );

  assert.equal(result.ready, true);
  assert.equal(result.checks.find((check) => check.name === "development-secret")?.status, "warn");
});

test("development readiness rejects a mismatched PostgreSQL checkpoint URL", () => {
  const result = assessPilotReadiness(
    {
      WORKFLOW_CHECKPOINT_BACKEND: "postgres",
      DATABASE_URL: "file:./prisma/dev.db",
    },
    "development",
  );

  assert.equal(result.ready, false);
  assert.equal(result.checks.find((check) => check.name === "checkpoint-database")?.status, "fail");
});
