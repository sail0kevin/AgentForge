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
// Prisma schema engine on Windows reliably handles a project-relative SQLite URL;
// the unique ignored file is removed in finally after the test run.
const databaseUrl = `file:./${databaseFileName}`;
const rawArgs = process.argv.slice(2);
const authModeArgument = rawArgs.find((argument) => argument.startsWith("--auth-mode="));
const authMode = authModeArgument?.split("=")[1] ?? "local";
if (authMode !== "local" && authMode !== "session") {
  throw new Error(`Unsupported E2E auth mode: ${authMode}`);
}
const playwrightArgs = rawArgs.filter((argument) => !argument.startsWith("--auth-mode="));

mkdirSync(testResultsDir, { recursive: true });

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
  try {
    // SQLite/Prisma may release Windows file handles a few milliseconds after
    // the child process exits. Retry cleanup without turning passing tests red.
    rmSync(filePath, { force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error) {
    console.warn(`Could not remove temporary E2E file ${filePath}:`, error instanceof Error ? error.message : error);
  }
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
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    removeTemporaryFile(`${databasePath}${suffix}`);
    removeTemporaryFile(`${checkpointDatabasePath}${suffix}`);
  }
}

process.exitCode = exitCode;
