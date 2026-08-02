import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const testResultsDir = path.join(projectRoot, "test-results");
const databaseFileName = `agentforge-e2e-${process.pid}-${Date.now()}.db`;
const databasePath = path.join(projectRoot, databaseFileName);
const checkpointFileName = `agentforge-checkpoint-e2e-${process.pid}-${Date.now()}.db`;
const checkpointDatabasePath = path.join(projectRoot, checkpointFileName);
const e2eNextDirectory = path.join(projectRoot, ".next-e2e");
// Prisma schema engine on Windows reliably handles a project-relative SQLite URL;
// the unique ignored file is removed in finally after the test run.
const databaseUrl = `file:./${databaseFileName}`;
const rawArgs = process.argv.slice(2);
const authModeArgument = rawArgs.find((argument) => argument.startsWith("--auth-mode="));
const authMode = authModeArgument?.split("=")[1] ?? "local";
if (authMode !== "local" && authMode !== "session") {
  throw new Error(`Unsupported E2E auth mode: ${authMode}`);
}
const keepDb = rawArgs.includes("--keep-db");
const playwrightArgs = rawArgs.filter((argument) => !argument.startsWith("--auth-mode=") && argument !== "--keep-db");
const cleanupRetryCount = 120;
const cleanupRetryDelayMs = 250;

mkdirSync(testResultsDir, { recursive: true });
// Next 开发服务器会生成临时类型文件；E2E 只使用并清理自己的独立构建目录。
rmSync(e2eNextDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });

const childEnv = {
  ...process.env,
  APP_AUTH_MODE: authMode,
  SESSION_SECRET: "agentforge-playwright-session-secret-at-least-32-chars",
  DATABASE_URL: databaseUrl,
  WORKFLOW_CHECKPOINT_DB_PATH: checkpointDatabasePath,
  ENCRYPTION_MASTER_KEY: "agentforge-playwright-encryption-key",
  AGENTFORGE_E2E_ISOLATED: "1",
  // Work around Prisma 7.8 SQLite schema-engine startup failures on Windows.
  RUST_LOG: "info",
};

function run(args) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["npx.cmd", ...args].join(" ")]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function removeTemporaryFile(filePath) {
  let lastError;

  for (let attempt = 0; attempt <= cleanupRetryCount; attempt += 1) {
    try {
      rmSync(filePath, { force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === cleanupRetryCount) break;

      // Windows 上 Playwright/Next 子进程退出后，SQLite 句柄可能延迟释放。
      // rmSync 对普通文件没有可依赖的内置重试，因此显式等待后再次回收。
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cleanupRetryDelayMs);
    }
  }

  console.warn(
    `Could not remove temporary E2E file after ${cleanupRetryCount * cleanupRetryDelayMs}ms ${filePath}:`,
    lastError instanceof Error ? lastError.message : lastError,
  );
}

let exitCode = 1;
try {
  exitCode = run([
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ]);

  if (exitCode === 0) {
    exitCode = run(["playwright", "test", ...playwrightArgs]);
  }
} finally {
  if (keepDb) {
    console.log(`\n[--keep-db] Preserved test database at: ${databasePath}`);
    console.log(`[--keep-db] Run agent-metrics against it with: DATABASE_URL="file:${databasePath}" npm run quality:agent-metrics`);
  } else {
    for (const suffix of ["", "-journal", "-shm", "-wal"]) {
      removeTemporaryFile(`${databasePath}${suffix}`);
      removeTemporaryFile(`${checkpointDatabasePath}${suffix}`);
    }
  }
  rmSync(e2eNextDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

process.exitCode = exitCode;
