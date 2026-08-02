import { PrismaClient } from "@prisma/client";
import { PrismaClient as PostgresPrismaClient } from "../../prisma/generated/postgres";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import path from "path";

// These paths select a runtime database; they are not build inputs and must not make
// Turbopack trace the entire repository into the server bundle.
const databaseUrl = process.env.DATABASE_URL || path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "dev.db");
const isPostgres = databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");
type ApplicationPrismaClient = PrismaClient;

const globalForPrisma = globalThis as unknown as { prisma?: ApplicationPrismaClient };

if (isPostgres) {
  const pool = new Pool({ connectionString: databaseUrl });
  // 两份 schema 由独立迁移和校验保持模型契约一致；此处集中收窄类型，
  // 避免业务层暴露 Prisma Client 联合类型，导致通用 delegate 无法调用。
  globalForPrisma.prisma ??= new PostgresPrismaClient({
    adapter: new PrismaPg(pool),
  }) as unknown as ApplicationPrismaClient;
} else {
  const url = databaseUrl.startsWith("file:") ? databaseUrl : `file:${path.resolve(/* turbopackIgnore: true */ databaseUrl)}`;
  globalForPrisma.prisma ??= new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}

export const prisma = globalForPrisma.prisma!;
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function canUseDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
