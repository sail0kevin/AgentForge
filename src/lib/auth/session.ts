import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  email: string;
  name?: string | null;
};

/**
 * 获取当前运行模式。
 * local 仅用于本机单用户开发；session 用于需要登录和用户隔离的环境。
 */
export function getAuthMode(): "local" | "session" {
  if (process.env.APP_AUTH_MODE === "local") return "local";
  if (process.env.APP_AUTH_MODE === "session") return "session";

  // 开发环境默认保持单用户本地体验；生产环境必须显式使用安全的 Session 模式。
  if (process.env.NODE_ENV !== "production") return "local";
  return "session";
}

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return new TextEncoder().encode(secret);

  // 本地单用户模式不会依赖 Cookie 登录，保留开发密钥只为兼容辅助接口。
  if (getAuthMode() === "local" && process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("local-session-secret-development-only");
  }
  throw new Error("SESSION_SECRET is required when APP_AUTH_MODE=session.");
}

/** 签发有效期 7 天的 Session JWT。 */
export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSessionKey());
}

/** 校验 Session JWT；篡改、过期或字段不完整时统一视为无效。 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") return null;
    return {
      userId: payload.userId,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

/** 从 HttpOnly Cookie 读取并校验 Session。 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token) : null;
}

/** 登录或注册成功后写入安全 Cookie，浏览器脚本无法读取其中的 JWT。 */
export async function setSession(payload: SessionPayload): Promise<void> {
  const token = await createSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** 删除 Session Cookie。 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
