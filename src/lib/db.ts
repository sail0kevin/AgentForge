import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import path from "path";

const databaseUrl = process.env.DATABASE_URL || path.join(process.cwd(), "prisma", "dev.db");

let adapter;
if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
  const pool = new Pool({ connectionString: databaseUrl });
  adapter = new PrismaPg(pool);
} else {
  const url = databaseUrl.startsWith("file:") ? databaseUrl : `file:${path.resolve(databaseUrl)}`;
  adapter = new PrismaLibSql({ url });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function canUseDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}