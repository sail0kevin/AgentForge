import "server-only";
import { prisma } from "@/lib/db";
import { getAuthMode, getSession } from "@/lib/auth/session";

export const DEFAULT_USER_EMAIL = "local@aiworkbench.dev";

/** local 模式专用：创建或复用唯一的本机用户。 */
export async function getOrCreateDefaultUser() {
  if (getAuthMode() !== "local") {
    throw new Error("Default user is only available when APP_AUTH_MODE=local.");
  }
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL, name: "Local User" },
  });
}

/**
 * 唯一的当前用户解析入口：local 模式返回本机用户，session 模式只信任已校验 Cookie。
 * 无效 Session 绝不会退回共享默认用户，避免不同用户看到同一份数据。
 */
export async function getCurrentUser() {
  if (getAuthMode() === "local") return getOrCreateDefaultUser();

  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHORIZED";

  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}
