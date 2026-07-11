import { destroySession, getAuthMode } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  }
  return Response.json({
    user: { id: user.id, email: user.email, name: user.name },
    authMode: getAuthMode(),
  }, { status: 200 });
}

/** 为兼容已有客户端，POST /api/auth/me 仍作为退出登录入口。 */
export async function POST() {
  await destroySession();
  return Response.json({ ok: true }, { status: 200 });
}
