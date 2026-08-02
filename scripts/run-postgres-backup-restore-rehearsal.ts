import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import { PrismaClient } from "../prisma/generated/postgres";
import {
  createPostgresBackupRestoreTarget,
  redactPostgresUrl,
} from "../src/lib/pilot/postgres-backup-restore";
import {
  continueProductWorkflow,
  createProductWorkflowGraph,
  startProductWorkflow,
  type ProductWorkflowDependencies,
} from "../src/lib/workflow/product-graph";
import { writeFencedWorkflowState } from "../src/lib/workflow/workflow-lease-store";

const confirmationValue = "isolated-test-database";
const sourceDatabaseUrl = process.env.AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL;

function executableFor(command: string) {
  // Windows 的 npm 与 PostgreSQL 工具可能通过 .cmd 暴露；不启用 shell，避免连接串被重新解释。
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executableFor(command), args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`POSTGRES_BACKUP_RESTORE_COMMAND_FAILED: ${command} exited with ${code ?? "unknown"}`));
    });
  });
}

async function assertCommandAvailable(command: string) {
  try {
    await run(command, ["--version"]);
  } catch {
    throw new Error(`POSTGRES_BACKUP_RESTORE_TOOL_MISSING: ${command} must be available in PATH`);
  }
}

function createDependencies(input: {
  crashDuringReview: boolean;
  calls: { plan: number; review: number; report: number };
}): ProductWorkflowDependencies {
  return {
    plan: async () => {
      input.calls.plan += 1;
      return { planningArtifactId: "backup-restore-plan", status: "ready", questions: [] };
    },
    review: async () => {
      input.calls.review += 1;
      if (input.crashDuringReview) throw new Error("BACKUP_RESTORE_SIMULATED_CRASH");
      return { reviewWorkflowId: "backup-restore-review", status: "approved" };
    },
    approve: async () => undefined,
    report: async () => {
      input.calls.report += 1;
      return { reportArtifactId: "backup-restore-report", status: "completed" };
    },
  };
}

async function createRestoredDatabase(adminPool: Pool, restoreDatabase: string) {
  // restoreDatabase 只由 createPostgresBackupRestoreTarget 生成的十六进制后缀组成，可安全作为标识符。
  await adminPool.query(`CREATE DATABASE "${restoreDatabase}" WITH TEMPLATE template0`);
}

async function dropRestoredDatabase(adminPool: Pool, restoreDatabase: string) {
  // DROP DATABASE 前先断开恢复验证打开的连接；不会影响源测试库或任何默认 DATABASE_URL。
  await adminPool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [restoreDatabase],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${restoreDatabase}"`);
}

async function main() {
  if (!sourceDatabaseUrl) {
    throw new Error(
      "POSTGRES_BACKUP_RESTORE_TEST_URL_REQUIRED: set AGENTFORGE_POSTGRES_BACKUP_RESTORE_TEST_URL explicitly",
    );
  }
  if (process.env.AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED !== confirmationValue) {
    throw new Error(
      `POSTGRES_BACKUP_RESTORE_CONFIRMATION_REQUIRED: set AGENTFORGE_POSTGRES_BACKUP_RESTORE_CONFIRMED=${confirmationValue}`,
    );
  }

  const target = createPostgresBackupRestoreTarget(sourceDatabaseUrl, randomBytes(8).toString("hex"));
  const sourceThreadId = `backup-restore-checkpoint-${randomUUID()}`;
  const sourceUserId = `backup-restore-user-${randomUUID()}`;
  const sourceWorkflowId = `backup-restore-workflow-${randomUUID()}`;
  const snapshotOwnerId = `backup-restore-owner-${randomUUID()}`;
  let adminPool: Pool | undefined;
  let sourcePool: Pool | undefined;
  let backupDirectory: string | undefined;
  let restoredDatabaseCreated = false;

  try {
    await Promise.all([assertCommandAvailable("pg_dump"), assertCommandAvailable("pg_restore")]);
    adminPool = new Pool({ connectionString: target.adminUrl });
    sourcePool = new Pool({ connectionString: target.sourceUrl });
    await createRestoredDatabase(adminPool, target.restoreDatabase);
    restoredDatabaseCreated = true;

    // 先写入一个 review 节点崩溃后的真实 LangGraph checkpoint，备份必须包含这个可恢复状态。
    const sourceCalls = { plan: 0, review: 0, report: 0 };
    const sourceSaver = PostgresSaver.fromConnString(target.sourceUrl);
    try {
      const sourceGraph = createProductWorkflowGraph(
        createDependencies({ crashDuringReview: true, calls: sourceCalls }),
        sourceSaver,
      );
      await assert.rejects(
        startProductWorkflow({
          graph: sourceGraph,
          workflowId: `wf-${sourceThreadId}`,
          threadId: sourceThreadId,
          userId: "backup-restore-checkpoint-user",
          requirement: "Verify a checkpoint survives pg_dump and pg_restore.",
        }),
        /BACKUP_RESTORE_SIMULATED_CRASH/,
      );
      assert.deepEqual(sourceCalls, { plan: 1, review: 1, report: 0 });
    } finally {
      await sourceSaver.end();
    }

    // 同时保存一条带 fencing token 的产品工作流，验证业务表并非只恢复了 Checkpoint DDL。
    await sourcePool.query(
      `INSERT INTO "User" ("id", "email", "globalBudget", "updatedAt")
       VALUES ($1, $2, 50, NOW())`,
      [sourceUserId, `${sourceUserId}@backup-restore.invalid`],
    );
    await sourcePool.query(
      `INSERT INTO "DevelopmentWorkflow" (
        "id", "userId", "threadId", "status", "currentNode", "requirement", "mode", "agentConfigJson",
        "leaseOwnerId", "leaseToken", "leaseExpiresAt", "version", "updatedAt"
      ) VALUES ($1, $2, $3, 'running', 'review_candidates', 'backup restore fencing proof', 'baseline', '{}', $4, 7, NOW() + INTERVAL '30 minutes', 12, NOW())`,
      [sourceWorkflowId, sourceUserId, `backup-restore-thread-${sourceWorkflowId}`, snapshotOwnerId],
    );

    backupDirectory = await mkdtemp(path.join(os.tmpdir(), "agentforge-postgres-backup-restore-"));
    const backupPath = path.join(backupDirectory, "agentforge-rehearsal.dump");
    await run("pg_dump", ["--format=custom", "--no-owner", `--file=${backupPath}`, target.pgToolSourceUrl]);
    const backup = await readFile(backupPath);
    const backupBytes = (await stat(backupPath)).size;
    const sha256 = createHash("sha256").update(backup).digest("hex");

    await run("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--exit-on-error",
      `--dbname=${target.pgToolRestoreUrl}`,
      backupPath,
    ]);

    // 新 Saver / 新 Graph 只连接恢复库，继续成功说明中断状态没有依赖原进程内存。
    const restoredCalls = { plan: 0, review: 0, report: 0 };
    const restoredSaver = PostgresSaver.fromConnString(target.restoreUrl);
    try {
      const restoredGraph = createProductWorkflowGraph(
        createDependencies({ crashDuringReview: false, calls: restoredCalls }),
        restoredSaver,
      );
      const completed = await continueProductWorkflow({ graph: restoredGraph, threadId: sourceThreadId });
      assert.equal(completed.finalStatus, "completed");
      assert.deepEqual(restoredCalls, { plan: 0, review: 1, report: 1 });
    } finally {
      await restoredSaver.end();
    }

    // 恢复后的旧 token 必须仍被拒绝；同一 owner/token 的当前写入才能成功。
    const restoredPool = new Pool({ connectionString: target.restoreUrl });
    const restoredPrisma = new PrismaClient({ adapter: new PrismaPg(restoredPool) });
    try {
      const restoredWorkflow = await restoredPrisma.developmentWorkflow.findUnique({
        where: { id: sourceWorkflowId },
        select: { leaseOwnerId: true, leaseToken: true, version: true },
      });
      assert.deepEqual(restoredWorkflow, {
        leaseOwnerId: snapshotOwnerId,
        leaseToken: 7,
        version: 12,
      });

      const staleWrite = await writeFencedWorkflowState({
        workflows: restoredPrisma.developmentWorkflow,
        workflowId: sourceWorkflowId,
        lease: { ownerId: "stale-instance", token: 6 },
        data: { currentNode: "must-not-write" },
      });
      assert.equal(staleWrite.count, 0);

      const currentWrite = await writeFencedWorkflowState({
        workflows: restoredPrisma.developmentWorkflow,
        workflowId: sourceWorkflowId,
        lease: { ownerId: snapshotOwnerId, token: 7 },
        data: { currentNode: "restore-verified" },
      });
      assert.equal(currentWrite.count, 1);
    } finally {
      await restoredPrisma.$disconnect();
      await restoredPool.end();
    }

    console.log(
      JSON.stringify({
        status: "passed",
        check: "postgres-backup-restore-rehearsal",
        source: redactPostgresUrl(target.sourceUrl),
        restoredDatabase: target.restoreDatabase,
        backupBytes,
        sha256,
      }),
    );
  } finally {
    // 源库只删除本次随机 thread 和 user；恢复库整体是本次创建的一次性测试库。
    if (sourceDatabaseUrl) {
      const cleanupSaver = PostgresSaver.fromConnString(sourceDatabaseUrl);
      await cleanupSaver.deleteThread(sourceThreadId).catch(() => undefined);
      await cleanupSaver.end().catch(() => undefined);
    }
    if (sourcePool) {
      await sourcePool.query(`DELETE FROM "User" WHERE "id" = $1`, [sourceUserId]).catch(() => undefined);
      await sourcePool.end();
    }
    if (adminPool && restoredDatabaseCreated) {
      await dropRestoredDatabase(adminPool, target.restoreDatabase)
        .catch((error) => console.error(`POSTGRES_BACKUP_RESTORE_CLEANUP_FAILED: ${error instanceof Error ? error.message : error}`));
    }
    await adminPool?.end();
    if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
