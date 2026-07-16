import "server-only";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const globalForWorkflowCheckpoint = globalThis as unknown as {
  agentforgeWorkflowCheckpointer?: SqliteSaver;
};

function checkpointDatabasePath() {
  return process.env.WORKFLOW_CHECKPOINT_DB_PATH
    || path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "workflow-checkpoints.db");
}

/**
 * Durable LangGraph checkpoint storage is intentionally separate from Prisma's
 * product tables. APIs expose only checkpoint IDs and sanitized node state.
 */
export function getWorkflowCheckpointer() {
  if (!globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer) {
    globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer = SqliteSaver.fromConnString(checkpointDatabasePath());
  }
  return globalForWorkflowCheckpoint.agentforgeWorkflowCheckpointer;
}
