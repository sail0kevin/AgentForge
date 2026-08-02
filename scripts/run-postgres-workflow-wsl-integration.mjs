import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

const distro = process.env.AGENTFORGE_WSL_DISTRO || "Ubuntu";
const suffix = randomBytes(8).toString("hex");
const roleName = `agentforge_p0_wsl_${suffix}`;
const databaseName = `agentforge_p0_wsl_${suffix}`;
const password = randomBytes(24).toString("hex");
let roleCreated = false;
let databaseCreated = false;
let stagedWorkspacePath;

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      shell: false,
    });
    let stderr = "";
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`POSTGRES_WSL_INTEGRATION_COMMAND_FAILED: ${command} ${args.join(" ")} (${stderr.trim() || `exit ${code ?? "unknown"}`})`));
    });
  });
}

async function resolveWslWorkspacePath() {
  const configuredPath = process.env.AGENTFORGE_WSL_WORKSPACE_PATH;
  if (configuredPath) return configuredPath;
  const parsed = path.win32.parse(process.cwd());
  if (!/^[a-zA-Z]:\\$/.test(parsed.root)) {
    throw new Error("POSTGRES_WSL_WORKSPACE_PATH_INVALID: set AGENTFORGE_WSL_WORKSPACE_PATH when the workspace is not on a mounted Windows drive");
  }
  // 直接转换盘符与剩余路径，避免 wsl.exe 对传入 Windows 路径的参数重写影响 wslpath。
  const drive = parsed.root[0].toLowerCase();
  const relativePath = process.cwd().slice(parsed.root.length).replaceAll("\\", "/");
  return `/mnt/${drive}/${relativePath}`;
}

async function wslAsPostgres(sql) {
  await run("wsl.exe", ["-d", distro, "-u", "postgres", "--", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", sql]);
}

async function wslRunProject(workspacePath, command, environment) {
  const assignments = Object.entries(environment)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
  // 仅把一次性测试连接串传给 WSL 子进程，不读取或转发宿主机 .env。
  const script = `cd ${shellQuote(workspacePath)} && ${assignments} ${command}`;
  await run("wsl.exe", ["-d", distro, "--", "bash", "-lc", script]);
}

async function prepareWslProject(sourceWorkspacePath) {
  const destination = `/tmp/agentforge-p0-wsl-${suffix}`;
  // WSL 与 Windows 共享的 node_modules 含平台原生依赖；复制源码后单独 npm ci，避免覆盖宿主机二进制。
  const script = [
    `rm -rf ${shellQuote(destination)}`,
    `mkdir -p ${shellQuote(destination)}`,
    // 集成测试只需要源码、迁移、脚本和 npm 元数据；避免遍历截图、构建产物等大文件。
    `tar --exclude='prisma/generated' -C ${shellQuote(sourceWorkspacePath)} -cf - package.json package-lock.json prisma.config.ts tsconfig.json src scripts prisma | tar -C ${shellQuote(destination)} -xf -`,
    `cd ${shellQuote(destination)}`,
    "npm ci",
  ].join(" && ");
  await run("wsl.exe", ["-d", distro, "--", "bash", "-lc", script]);
  stagedWorkspacePath = destination;
  return destination;
}

async function cleanupWslProject() {
  if (!stagedWorkspacePath) return;
  await run("wsl.exe", ["-d", distro, "--", "bash", "-lc", `rm -rf ${shellQuote(stagedWorkspacePath)}`])
    .catch((error) => console.error(`POSTGRES_WSL_INTEGRATION_WORKSPACE_CLEANUP_FAILED: ${error instanceof Error ? error.message : error}`));
}

async function assertWslAvailable() {
  await run("wsl.exe", ["-d", distro, "--", "bash", "-lc", "command -v node >/dev/null && command -v npm >/dev/null && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null"]);
  await run("wsl.exe", ["-d", distro, "-u", "postgres", "--", "psql", "-d", "postgres", "-Atqc", "SELECT 1"]);
}

async function main() {
  const testDatabaseUrl = `postgresql://${roleName}:${password}@127.0.0.1:5432/${databaseName}?schema=public`;
  const environment = {
    DATABASE_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED: "isolated-test-database",
  };

  try {
    await assertWslAvailable();
    const workspacePath = await resolveWslWorkspacePath();
    await run("wsl.exe", ["-d", distro, "--", "bash", "-lc", `test -f ${shellQuote(`${workspacePath}/package.json`)}`]);
    const stagedProjectPath = await prepareWslProject(workspacePath);
    // 名称由受限的十六进制随机后缀构成，可安全用于 PostgreSQL 标识符；密码只用于一次性测试角色。
    await wslAsPostgres(`CREATE ROLE ${roleName} LOGIN CREATEDB PASSWORD '${password}'`);
    roleCreated = true;
    await wslAsPostgres(`CREATE DATABASE ${databaseName} OWNER ${roleName}`);
    databaseCreated = true;

    await wslRunProject(stagedProjectPath, "npm run db:generate:postgres", environment);
    await wslRunProject(stagedProjectPath, "npm run db:migrate:postgres", environment);
    // 先执行一次部署阶段的 Checkpointer DDL，集成测试只验证已初始化表的行为。
    await wslRunProject(stagedProjectPath, "npm run db:setup:workflow-checkpoints", environment);
    await wslRunProject(stagedProjectPath, "npm run test:integration:postgres-checkpoint", environment);
    await wslRunProject(stagedProjectPath, "npm run test:integration:postgres-workflow-lease", environment);
    await wslRunProject(stagedProjectPath, "npm run test:integration:postgres-backup-restore", environment);
    console.log("POSTGRES_WSL_WORKFLOW_INTEGRATION_PASSED: dedicated WSL PostgreSQL acceptance completed.");
  } finally {
    await cleanupWslProject();
    // 先断开再删除；两个对象均为本次随机命名，绝不触碰已有 agentforge 数据库。
    if (databaseCreated) {
      await wslAsPostgres(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
        .catch((error) => console.error(`POSTGRES_WSL_INTEGRATION_DATABASE_CLEANUP_FAILED: ${error instanceof Error ? error.message : error}`));
    }
    if (roleCreated) {
      await wslAsPostgres(`DROP ROLE IF EXISTS ${roleName}`)
        .catch((error) => console.error(`POSTGRES_WSL_INTEGRATION_ROLE_CLEANUP_FAILED: ${error instanceof Error ? error.message : error}`));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
