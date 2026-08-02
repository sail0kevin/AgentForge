import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres = databaseUrl.startsWith("postgresql") || databaseUrl.startsWith("postgres");

export default defineConfig({
  schema: isPostgres ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isPostgres ? "prisma/postgres/migrations" : "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
