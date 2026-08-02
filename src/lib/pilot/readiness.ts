export type PilotReadinessEnvironment = Record<string, string | undefined>;

export type PilotReadinessCheck = {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
};

export type PilotReadinessResult = {
  target: "development" | "production";
  ready: boolean;
  checks: PilotReadinessCheck[];
};

const PLACEHOLDER_PATTERN = /replace-with|change-before-production|placeholder|example/i;

function isUsableSecret(value: string | undefined) {
  return Boolean(value && value.length >= 32 && !PLACEHOLDER_PATTERN.test(value));
}

function isPostgresUrl(value: string | undefined) {
  return Boolean(value && /^(postgres|postgresql):\/\//i.test(value));
}

/**
 * 只检查部署配置，不读取密钥内容、不连接外部服务，也不执行迁移。
 * production 目标要求把本地 SQLite/本地认证明确切换为可隔离的服务端配置。
 */
export function assessPilotReadiness(
  env: PilotReadinessEnvironment,
  target: "development" | "production" = "development",
): PilotReadinessResult {
  const checks: PilotReadinessCheck[] = [];
  const add = (name: string, status: PilotReadinessCheck["status"], message: string) => {
    checks.push({ name, status, message });
  };

  if (target === "production") {
    add(
      "auth-mode",
      env.APP_AUTH_MODE === "session" ? "pass" : "fail",
      env.APP_AUTH_MODE === "session"
        ? "APP_AUTH_MODE=session"
        : "生产试点必须显式使用 APP_AUTH_MODE=session",
    );
    add(
      "session-secret",
      isUsableSecret(env.SESSION_SECRET) ? "pass" : "fail",
      isUsableSecret(env.SESSION_SECRET)
        ? "SESSION_SECRET 已配置且满足长度要求"
        : "SESSION_SECRET 缺失、过短或仍是示例值",
    );
    add(
      "encryption-key",
      isUsableSecret(env.ENCRYPTION_MASTER_KEY) ? "pass" : "fail",
      isUsableSecret(env.ENCRYPTION_MASTER_KEY)
        ? "ENCRYPTION_MASTER_KEY 已配置且满足长度要求"
        : "ENCRYPTION_MASTER_KEY 缺失、过短或仍是示例值",
    );
    add(
      "product-database",
      isPostgresUrl(env.DATABASE_URL) ? "pass" : "fail",
      isPostgresUrl(env.DATABASE_URL)
        ? "DATABASE_URL 使用 PostgreSQL"
        : "生产试点必须使用 PostgreSQL DATABASE_URL",
    );
    add(
      "workflow-checkpointer",
      env.WORKFLOW_CHECKPOINT_BACKEND === "postgres" ? "pass" : "fail",
      env.WORKFLOW_CHECKPOINT_BACKEND === "postgres"
        ? "工作流 Checkpointer 使用 PostgreSQL"
        : "生产试点必须显式设置 WORKFLOW_CHECKPOINT_BACKEND=postgres",
    );
    add(
      "checkpoint-auto-setup",
      env.WORKFLOW_CHECKPOINT_AUTO_SETUP === "true" ? "fail" : "pass",
      env.WORKFLOW_CHECKPOINT_AUTO_SETUP === "true"
        ? "生产环境不允许应用实例自动执行 Checkpoint DDL"
        : "Checkpoint 自动建表未开启",
    );
  } else {
    add("development-mode", "pass", "开发目标允许本地认证和 SQLite 默认配置");
    if (env.APP_AUTH_MODE === "local" && env.NODE_ENV === "production") {
      add("auth-mode-consistency", "fail", "NODE_ENV=production 时不能使用 APP_AUTH_MODE=local");
    } else {
      add("auth-mode-consistency", "pass", "认证模式与目标环境没有冲突");
    }
    if (env.WORKFLOW_CHECKPOINT_BACKEND === "postgres" && !isPostgresUrl(env.DATABASE_URL)) {
      add("checkpoint-database", "fail", "PostgreSQL Checkpointer 已开启但 DATABASE_URL 不是 PostgreSQL");
    } else {
      add("checkpoint-database", "pass", "开发 Checkpointer 配置自洽");
    }
    if (!isUsableSecret(env.ENCRYPTION_MASTER_KEY)) {
      add("development-secret", "warn", "开发环境使用临时加密密钥；进入 session/生产试点前必须替换");
    } else {
      add("development-secret", "pass", "开发环境已提供非示例加密密钥");
    }
  }

  return {
    target,
    ready: checks.every((check) => check.status !== "fail"),
    checks,
  };
}
