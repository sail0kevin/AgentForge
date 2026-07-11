import { prisma } from "@/lib/db";
import { setSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/security/password";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Email and password are required." } }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = Boolean(user?.passwordHash) && await verifyPassword(password, user!.passwordHash!);
    // 邮箱不存在和密码错误使用相同提示，避免暴露某个邮箱是否已注册。
    if (!user || !valid) {
      return Response.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } }, { status: 401 });
    }

    await setSession({ userId: user.id, email: user.email, name: user.name });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 200 });
  } catch {
    return Response.json({ error: { code: "LOGIN_FAILED", message: "Login failed." } }, { status: 500 });
  }
}
