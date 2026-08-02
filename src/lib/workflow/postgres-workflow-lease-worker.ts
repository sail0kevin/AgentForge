import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../prisma/generated/postgres";
import { Pool } from "pg";
import { claimExpiredWorkflowLease, renewActiveWorkflowLease, writeFencedWorkflowState } from "./workflow-lease-store";

const action = process.env.AGENTFORGE_LEASE_WORKER_ACTION;
const databaseUrl = process.env.AGENTFORGE_POSTGRES_WORKFLOW_TEST_URL;
const workflowId = process.env.AGENTFORGE_LEASE_WORKER_WORKFLOW_ID;
const ownerId = process.env.AGENTFORGE_LEASE_WORKER_OWNER_ID;
const token = Number(process.env.AGENTFORGE_LEASE_WORKER_TOKEN);

if (!action || !databaseUrl || !workflowId || !ownerId || !Number.isInteger(token)) {
  throw new Error("POSTGRES_LEASE_WORKER_INPUT_MISSING");
}

// 将已校验的进程输入固定为非空常量，避免异步入口丢失 TypeScript 的类型收窄。
const leaseWorkerAction = action;
const leaseWorkerDatabaseUrl = databaseUrl;
const leaseWorkerWorkflowId = workflowId;
const leaseWorkerOwnerId = ownerId;

/**
 * 竞争测试让两个独立进程先读取相同的 version/token，再由父进程同时放行。
 * 该同步点仅存在于集成测试 worker，不会进入生产租约路径。
 */
async function waitForRaceStart() {
  process.stdout.write(`${JSON.stringify({ event: "ready" })}\n`);
  await new Promise<void>((resolve, reject) => {
    let received = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      received += chunk;
      if (received.includes("go\n")) resolve();
    });
    process.stdin.once("error", reject);
    process.stdin.once("end", () => reject(new Error("POSTGRES_LEASE_RACE_START_MISSING")));
  });
}

// 子进程使用独立 Prisma Client，真实模拟另一个应用实例，而不是复用同一段 SQL。
const pool = new Pool({ connectionString: leaseWorkerDatabaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/**
 * 将异步数据库操作放进显式入口，兼容 tsx 在 CommonJS 模式下启动派生 worker。
 */
async function main() {
  try {
    let result: { count: number };
    if (leaseWorkerAction === "claim" || leaseWorkerAction === "claim-race") {
      const workflow = await prisma.developmentWorkflow.findUnique({
        where: { id: leaseWorkerWorkflowId },
        select: { userId: true, version: true, leaseToken: true },
      });
      if (!workflow) throw new Error("POSTGRES_LEASE_WORKFLOW_MISSING");
      if (leaseWorkerAction === "claim-race") await waitForRaceStart();
      result = await claimExpiredWorkflowLease({
        workflows: prisma.developmentWorkflow,
        workflowId: leaseWorkerWorkflowId,
        userId: workflow.userId,
        expectedVersion: workflow.version,
        expectedLeaseToken: workflow.leaseToken,
        lease: { ownerId: leaseWorkerOwnerId, token, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
        now: new Date(),
      });
    } else if (leaseWorkerAction === "expire") {
      // 用同一 Prisma PostgreSQL 路径写入明确的 UTC 过期时间，避免测试夹具跨驱动编码差异。
      result = await prisma.developmentWorkflow.updateMany({
        where: { id: leaseWorkerWorkflowId },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      });
    } else if (leaseWorkerAction === "renew") {
      result = await renewActiveWorkflowLease({
        workflows: prisma.developmentWorkflow,
        workflowId: leaseWorkerWorkflowId,
        lease: { ownerId: leaseWorkerOwnerId, token },
        now: new Date(),
        durationMs: 30 * 60 * 1000,
      });
    } else if (leaseWorkerAction === "fenced-write") {
      result = await writeFencedWorkflowState({
        workflows: prisma.developmentWorkflow,
        workflowId: leaseWorkerWorkflowId,
        lease: { ownerId: leaseWorkerOwnerId, token },
        data: { currentNode: `worker-${leaseWorkerOwnerId}` },
      });
    } else {
      throw new Error("POSTGRES_LEASE_WORKER_ACTION_INVALID");
    }
    process.stdout.write(`${JSON.stringify({ rowCount: result.count })}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
