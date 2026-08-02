import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("postgres")) {
    throw new Error("WORKFLOW_CHECKPOINT_POSTGRES_URL_REQUIRED: set DATABASE_URL to a PostgreSQL connection string");
  }

  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  try {
    // 部署阶段单独执行初始化，避免多个应用实例启动时并发执行 Checkpoint DDL。
    await checkpointer.setup();
    console.log("PostgreSQL workflow checkpoint tables are ready.");
  } finally {
    await checkpointer.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
