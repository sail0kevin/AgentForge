import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // 与应用默认行为保持一致：未配置 DATABASE_URL 时使用本地 SQLite。
    // PostgreSQL 部署必须显式提供 postgresql:// 连接串和对应 schema。
    url: process.env.DATABASE_URL || "file:./prisma/dev.db",
  },
});
