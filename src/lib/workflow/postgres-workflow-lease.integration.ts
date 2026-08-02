import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { Pool } from "pg";

// 只接受明确指定的专用测试连接串，禁止意外使用应用的 DATABASE_URL。
const postgresTestUrl = process.env.AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL
  ?? process.env.AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL;
const workerPath = path.join(process.cwd(), "src", "lib", "workflow", "postgres-workflow-lease-worker.ts");

type WorkerAction = "claim" | "claim-race" | "expire" | "renew" | "fenced-write";
type WorkerInput = { action: WorkerAction; workflowId: string; ownerId: string; token: number };

function runWorker(input: WorkerInput) {
  return new Promise<{ rowCount: number }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL: postgresTestUrl,
        AGENTFORGE_LEASE_WORKER_ACTION: input.action,
        AGENTFORGE_LEASE_WORKER_WORKFLOW_ID: input.workflowId,
        AGENTFORGE_LEASE_WORKER_OWNER_ID: input.ownerId,
        AGENTFORGE_LEASE_WORKER_TOKEN: String(input.token),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`POSTGRES_LEASE_WORKER_FAILED: ${stderr || `exit ${code}`}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as { rowCount: number });
      } catch {
        reject(new Error(`POSTGRES_LEASE_WORKER_OUTPUT_INVALID: ${stdout}`));
      }
    });
  });
}

/**
 * 两个 worker 均读取到同一 version/token 后，父进程才同时放行它们的条件更新。
 * 测试不依赖睡眠时间：数据库必须只允许一个 compare-and-set 更新成功。
 */
function runClaimRace(inputs: [WorkerInput, WorkerInput]) {
  return new Promise<[{ rowCount: number }, { rowCount: number }]>((resolve, reject) => {
    const states = inputs.map((input) => {
      const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL: postgresTestUrl,
          AGENTFORGE_LEASE_WORKER_ACTION: input.action,
          AGENTFORGE_LEASE_WORKER_WORKFLOW_ID: input.workflowId,
          AGENTFORGE_LEASE_WORKER_OWNER_ID: input.ownerId,
          AGENTFORGE_LEASE_WORKER_TOKEN: String(input.token),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { child, ready: false, stdout: "", stderr: "" };
    });
    const results: Array<{ rowCount: number } | undefined> = [undefined, undefined];
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      states.forEach(({ child }) => child.kill());
      reject(error);
    };
    const releaseWhenReady = () => {
      if (states.every(({ ready }) => ready)) {
        states.forEach(({ child }) => child.stdin.end("go\n"));
      }
    };

    states.forEach((state, index) => {
      state.child.stdout.setEncoding("utf8");
      state.child.stderr.setEncoding("utf8");
      state.child.stdout.on("data", (chunk: string) => {
        state.stdout += chunk;
        const lines = state.stdout.split("\n");
        state.stdout = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const message = JSON.parse(line) as { event?: string; rowCount?: number };
            if (message.event === "ready") {
              state.ready = true;
              releaseWhenReady();
            } else if (typeof message.rowCount === "number") {
              results[index] = { rowCount: message.rowCount };
            }
          } catch {
            fail(new Error(`POSTGRES_LEASE_RACE_WORKER_OUTPUT_INVALID: ${line}`));
          }
        }
      });
      state.child.stderr.on("data", (chunk: string) => { state.stderr += chunk; });
      state.child.once("error", fail);
      state.child.once("exit", (code) => {
        if (settled) return;
        if (code !== 0 || !results[index]) {
          fail(new Error(`POSTGRES_LEASE_RACE_WORKER_FAILED: ${state.stderr || `exit ${code ?? "unknown"}`}`));
          return;
        }
        if (results.every((result) => result)) {
          settled = true;
          resolve(results as [{ rowCount: number }, { rowCount: number }]);
        }
      });
    });
  });
}

test(
  "integration: PostgreSQL lease claim, renewal, and fencing are safe across processes",
  { skip: postgresTestUrl ? false : "PostgreSQL workflow lease test skipped: set AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL or AGENTFORGE_POSTGRES_CHECKPOINT_TEST_URL" },
  async () => {
    const pool = new Pool({ connectionString: postgresTestUrl! });
    const suffix = randomUUID();
    const userId = `integration-user-${suffix}`;
    const workflowId = `integration-workflow-${suffix}`;
    const ownerA = `instance-a-${suffix}`;
    const ownerB = `instance-b-${suffix}`;
    try {
      // 测试数据使用随机 ID，与任何非测试工作流隔离；外键要求先创建用户。
      await pool.query(
        `INSERT INTO "User" ("id", "email", "globalBudget", "updatedAt") VALUES ($1, $2, 50, NOW())`,
        [userId, `${suffix}@lease-test.invalid`],
      );
      await pool.query(
        `INSERT INTO "DevelopmentWorkflow" (
          "id", "userId", "threadId", "status", "currentNode", "requirement", "mode", "agentConfigJson",
          "leaseOwnerId", "leaseToken", "leaseExpiresAt", "updatedAt"
        ) VALUES ($1, $2, $3, 'running', 'create_plan', 'integration lease test', 'baseline', '{}', $4, 1, NOW() + INTERVAL '30 minutes', NOW())`,
        [workflowId, userId, `integration-thread-${suffix}`, ownerA],
      );

      // 独立进程 B 不能在 A 的租约未到期时抢占。
      assert.equal((await runWorker({ action: "claim", workflowId, ownerId: ownerB, token: 2 })).rowCount, 0);
      // 独立进程 A 可以续租，且 token 保持不变。
      assert.equal((await runWorker({ action: "renew", workflowId, ownerId: ownerA, token: 1 })).rowCount, 1);

      // 使 A 的租约过期后，独立进程 B 必须通过条件更新接管并获得递增 token。
      await runWorker({ action: "expire", workflowId, ownerId: ownerA, token: 1 });
      const raceResults = await runClaimRace([
        { action: "claim-race", workflowId, ownerId: ownerA, token: 2 },
        { action: "claim-race", workflowId, ownerId: ownerB, token: 2 },
      ]);
      // 两个独立进程已在同一 version/token 快照上同步，条件更新只能允许一个实例接管。
      assert.deepEqual(raceResults.map(({ rowCount }) => rowCount).sort(), [0, 1]);

      const raceWinner = raceResults[0].rowCount === 1 ? ownerA : ownerB;
      const raceLoser = raceWinner === ownerA ? ownerB : ownerA;
      const afterRace = await pool.query<{ leaseOwnerId: string | null; leaseToken: number }>(
        `SELECT "leaseOwnerId", "leaseToken" FROM "DevelopmentWorkflow" WHERE "id" = $1`,
        [workflowId],
      );
      assert.deepEqual(afterRace.rows[0], { leaseOwnerId: raceWinner, leaseToken: 2 });
      assert.equal((await runWorker({ action: "fenced-write", workflowId, ownerId: raceLoser, token: 2 })).rowCount, 0);

      // 再次过期后，实例 B 仍必须以更大的 token 接管，不能复用首轮接管 token。
      await runWorker({ action: "expire", workflowId, ownerId: raceWinner, token: 2 });
      assert.equal((await runWorker({ action: "claim", workflowId, ownerId: ownerB, token: 3 })).rowCount, 1);

      const afterClaim = await pool.query<{ leaseOwnerId: string | null; leaseToken: number }>(
        `SELECT "leaseOwnerId", "leaseToken" FROM "DevelopmentWorkflow" WHERE "id" = $1`,
        [workflowId],
      );
      assert.deepEqual(afterClaim.rows[0], { leaseOwnerId: ownerB, leaseToken: 3 });

      // A 的旧 token 不能覆盖 B；B 的当前 token 可以完成写入。
      assert.equal((await runWorker({ action: "fenced-write", workflowId, ownerId: ownerA, token: 1 })).rowCount, 0);
      assert.equal((await runWorker({ action: "fenced-write", workflowId, ownerId: ownerB, token: 3 })).rowCount, 1);
    } finally {
      // 删除用户会通过外键级联删除本测试唯一的 workflow，测试不会残留业务记录。
      await pool.query(`DELETE FROM "User" WHERE "id" = $1`, [userId]).catch(() => undefined);
      await pool.end();
    }
  },
);
