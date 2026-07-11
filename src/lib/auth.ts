import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security/password";

export async function registerUser(email: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("EMAIL_EXISTS");
  const passwordHash = await hashPassword(password);
  return prisma.user.create({ data: { email, name, passwordHash } });
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  return { id: user.id, email: user.email, name: user.name };
}
