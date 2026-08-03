import { spawn, spawnSync } from "node:child_process";
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
const serverUrl = "http://127.0.0.1:3110";
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
rmSync(e2eNextDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });

const childEnv = {
  ...process.env,
  APP_AUTH_MODE: authMode,
  SESSION_SECRET: "agentforge-playwright-session-secret-at-least-32-chars",
  DATABASE_URL: databaseUrl,
  WORKFLOW_CHECKPOINT_DB_PATH: checkpointDatabasePath,
  ENCRYPTION_MASTER_KEY: "agentforge-playwright-encryption-key",
  AGENTFORGE_E2E_ISOLATED: "1",
  AGENTFORGE_E2E_MANAGED_SERVER: "1",
  PROVIDER_TIMEOUT_MS: "300",
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

function startNextServer() {
  return spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3110"],
    {
      cwd: projectRoot,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    },
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(server) {
  const timeoutAt = Date.now() + 120_000;
  let lastError;

  while (Date.now() < timeoutAt) {
    if (server.exitCode !== null) {
      throw new Error(`Next development server exited before becoming ready (exit code ${server.exitCode}).`);
    }

    try {
      const response = await fetch(serverUrl, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for the Next development server: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

async function waitForChildExit(server, timeoutMilliseconds) {
  if (server.exitCode !== null) return true;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMilliseconds);
    timeout.unref();
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function stopNextServer(server) {
  if (!server?.pid || server.exitCode !== null) return;

  // 先直接终止当前脚本创建的 Node 进程；Windows 上这比经由 shell 的间接回收更可靠。
  server.kill("SIGKILL");
  if (await waitForChildExit(server, 10_000)) return;

  // Next 可能创建额外子进程，直接终止未完成时再按进程树兜底回收。
  if (process.platform === "win32") {
    const taskkill = spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (taskkill.error || taskkill.status !== 0) {
      const detail = taskkill.error?.message ?? taskkill.stderr?.trim() ?? `exit code ${taskkill.status}`;
      console.warn(`[e2e] Could not force-stop the Next process tree: ${detail}`);
    }
  }

  if (!(await waitForChildExit(server, 10_000))) {
    throw new Error(`Next development server process ${server.pid} did not stop after forced shutdown.`);
  }
}
function removeTemporaryFiles(filePaths) {
  let remaining = filePaths.map((filePath) => ({ filePath, lastError: undefined }));

  for (let attempt = 0; attempt <= cleanupRetryCount; attempt += 1) {
    remaining = remaining.flatMap(({ filePath }) => {
      try {
        rmSync(filePath, { force: true });
        return [];
      } catch (error) {
        return [{ filePath, lastError: error }];
      }
    });
    if (remaining.length === 0) return;
    if (attempt === cleanupRetryCount) break;

    // 所有临时文件共享同一重试窗口，避免每个 WAL/SHM 文件都串行等待一轮。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cleanupRetryDelayMs);
  }

  for (const { filePath, lastError } of remaining) {
    console.warn(
      `Could not remove temporary E2E file after ${cleanupRetryCount * cleanupRetryDelayMs}ms ${filePath}:`,
      lastError instanceof Error ? lastError.message : lastError,
    );
  }
}

let exitCode = 1;
let nextServer;
try {
  exitCode = run(["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);

  if (exitCode === 0) {
    nextServer = startNextServer();
    await waitForServer(nextServer);
    exitCode = run(["playwright", "test", ...playwrightArgs]);
  }
} finally {
  await stopNextServer(nextServer);

  if (keepDb) {
    console.log(`\n[--keep-db] Preserved test database at: ${databasePath}`);
    console.log(`[--keep-db] Run agent-metrics against it with: DATABASE_URL="file:${databasePath}" npm run quality:agent-metrics`);
  } else {
    const temporaryFiles = [databasePath, checkpointDatabasePath]
      .flatMap((filePath) => ["", "-journal", "-shm", "-wal"].map((suffix) => `${filePath}${suffix}`));
    removeTemporaryFiles(temporaryFiles);
  }
  rmSync(e2eNextDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

process.exitCode = exitCode;
