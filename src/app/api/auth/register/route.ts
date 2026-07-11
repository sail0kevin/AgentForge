import { prisma } from "@/lib/db";
import { setSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/security/password";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!email || !email.includes("@")) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Valid email is required." } }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters." } }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Email already registered." } }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, name: name || null, passwordHash } });
    await setSession({ userId: user.id, email: user.email, name: user.name });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
  } catch {
    return Response.json({ error: { code: "REGISTRATION_FAILED", message: "Registration failed." } }, { status: 500 });
  }
}
