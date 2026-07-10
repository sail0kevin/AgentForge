import { prisma } from "@/lib/db";

export const DEFAULT_USER_EMAIL = "local@aiworkbench.dev";

export async function getOrCreateDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: {
      email: DEFAULT_USER_EMAIL,
      name: "Local Developer",
    },
  });
}
