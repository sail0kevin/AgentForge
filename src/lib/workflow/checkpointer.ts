import "server-only";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const globalForWorkflowCheckpoint = globalThis as unknown as {
  agentforgeWorkflowCheckpointer?: SqliteSaver | PostgresSaver;
};

function shouldAutoSetupPostgresCheckpoint() {
  // 多实例生产环境中，PostgresSaver.setup() 的 DDL 不带跨进程初始化锁。
  // 生产默认改由部署命令预先初始化；本地开发和显式开关仍可自动建表。
  return process.env.NODE_ENV !== "production" || process.env.WORKFLOW_CHECKPOINT_AUTO_SETUP === "true";
}

function checkpointDatabasePath() {
  return process.env.WORKFLOW_CHECKPOINT_DB_PATH
    || path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "workflow-checkpoints.db");
}

/**
 * Durable LangGraph checkpoint storage is intentionally separate from Prisma's
 * product tables. APIs expose only checkpoint IDs and sanitized node state.
 *
 * WORKFLOW_CHECKPOINT_BACKEND=postgres: 使用 PostgresSaver，复用 DATABASE_URL。
 * 其他/留空: 使用 SqliteSaver（本地单机默认）。
 *
 * 开发环境会自动调用 PostgresSaver.setup()；生产环境应先运行
 * `npm run db:setup:workflow-checkpoints`，避免多个实例同时执行初始化 DDL。
 */
export async function getWorkflowCheckpointer(): Promise<SqliteSaver | PostgresSaver> {
  if (!globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer) {
    if (process.env.WORKFLOW_CHECKPOINT_BACKEND === "postgres") {
      const connString = process.env.DATABASE_URL;
      if (!connString) throw new Error("WORKFLOW_CHECKPOINT_BACKEND=postgres requires DATABASE_URL to be set");
      if (!connString.startsWith("postgres")) {
        throw new Error("WORKFLOW_CHECKPOINT_BACKEND=postgres requires DATABASE_URL to be a PostgreSQL connection string");
      }
      const checkpointer = PostgresSaver.fromConnString(connString);
      if (shouldAutoSetupPostgresCheckpoint()) {
        // PostgresSaver.setup() 是异步且不会自动调用——开发环境首次使用时显式完成。
        await checkpointer.setup();
      }
      globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer = checkpointer;
    } else {
      globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer = SqliteSaver.fromConnString(checkpointDatabasePath());
    }
  }
  return globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer;
}
