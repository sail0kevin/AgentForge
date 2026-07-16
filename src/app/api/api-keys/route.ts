import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { encryptApiKey } from "@/lib/security/crypto";
import { apiKeyCreateSchema } from "@/lib/validation";

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const [apiKeys, agents] = await Promise.all([
    prisma.apiKey.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" },
      select: { id: true, provider: true, maskedKey: true, isValid: true, createdAt: true, updatedAt: true },
    }),
    // 智能体凭证与全局供应商密钥分开存储。这里统一返回“是否已加密保存”的
    // 安全摘要，避免用户在智能体设置中保存后误以为没有生效。
    prisma.agent.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        provider: true,
        credential: { select: { maskedKey: true, isValid: true } },
      },
    }),
  ]);

  return NextResponse.json([
    ...apiKeys.map((key) => ({ ...key, source: "provider" as const })),
    ...agents
      .filter((agent) => agent.credential)
      .map((agent) => ({
        id: `agent:${agent.id}`,
        provider: agent.provider,
        maskedKey: agent.credential!.maskedKey,
        isValid: agent.credential!.isValid,
        source: "agent" as const,
        agentName: agent.name,
      })),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const body = apiKeyCreateSchema.parse(await request.json());
    const encrypted = encryptApiKey(body.apiKey);
    const apiKey = await prisma.apiKey.upsert({
      where: { userId_provider: { userId: user.id, provider: body.provider } },
      update: { ...encrypted, isValid: true },
      create: { userId: user.id, provider: body.provider, ...encrypted },
      select: { id: true, provider: true, maskedKey: true, isValid: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(apiKey, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save API key" }, { status: 400 });
  }
}
