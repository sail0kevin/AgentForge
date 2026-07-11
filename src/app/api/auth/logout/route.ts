import { destroySession } from "@/lib/auth/session";

/** DELETE /api/auth/logout - clear the current browser session. */
export async function DELETE() {
  await destroySession();
  return Response.json({ ok: true }, { status: 200 });
}
