import { spawn } from "node:child_process";

const composeProject = "agentforge-p0-postgres-test";
const testDatabaseUrl = "postgresql://agentforge_v2_test:agentforge_v2_test@localhost:5433/agentforge_v2_test?schema=public";
let composeStarted = false;

function executableFor(command) {
  // Windows 的 npm 是 .cmd 文件；显式选择它可以避免为了兼容性启用 shell。
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function run(command, args, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executableFor(command), args, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`POSTGRES_WORKFLOW_INTEGRATION_COMMAND_FAILED: ${command} ${args.join(" ")} (exit ${code ?? "unknown"})`));
    });
  });
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawn(executableFor(command), ["--version"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
      shell: false,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

async function main() {
  const environment = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL: testDatabaseUrl,
    AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED: "isolated-test-database",
  };

  try {
    if (!(await commandAvailable("docker"))) {
      throw new Error(
        "POSTGRES_WORKFLOW_INTEGRATION_ENVIRONMENT_MISSING: Docker CLI is required; PostgreSQL验收未执行。请安装并启动 Docker Desktop 后重试。",
      );
    }

    // 独立 Compose 项目只管理 postgres-test，避免停止或删除开发数据库服务。
    await run("docker", ["compose", "-p", composeProject, "--profile", "test", "up", "-d", "--wait", "postgres-test"]);
    composeStarted = true;
    // 专用测试会导入 PostgreSQL 生成客户端；保证全新安装依赖后的本地验收顺序与 CI 一致。
    await run("npm", ["run", "db:generate:postgres"], environment);
    await run("npm", ["run", "db:migrate:postgres"], environment);
    // 先按部署流程初始化 LangGraph Checkpointer，再运行只验证恢复/租约的集成测试。
    await run("npm", ["run", "db:setup:workflow-checkpoints"], environment);
    await run("npm", ["run", "test:integration:postgres-checkpoint"], environment);
    await run("npm", ["run", "test:integration:postgres-workflow-lease"], environment);
    // Docker 专用测试库也必须演练 pg_dump/pg_restore，避免只验证运行时路径而漏掉恢复链路。
    await run("npm", ["run", "test:integration:postgres-backup-restore"], environment);
    console.log("POSTGRES_WORKFLOW_INTEGRATION_PASSED: dedicated PostgreSQL acceptance completed.");
  } finally {
    // 仅在测试容器确实启动后清理，避免环境缺失时再次制造误导性错误。
    if (composeStarted) {
      await run("docker", ["compose", "-p", composeProject, "--profile", "test", "down", "--volumes", "--remove-orphans"])
        .catch((error) => console.error(`POSTGRES_WORKFLOW_INTEGRATION_CLEANUP_FAILED: ${error instanceof Error ? error.message : error}`));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
