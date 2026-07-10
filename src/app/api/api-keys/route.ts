import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { encryptApiKey } from "@/lib/security/crypto";
import { apiKeyCreateSchema } from "@/lib/validation";

export async function GET() {
  const user = await getOrCreateDefaultUser();
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      maskedKey: true,
      isValid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(apiKeys);
}

export async function POST(request: NextRequest) {
  const body = apiKeyCreateSchema.parse(await request.json());
  const user = await getOrCreateDefaultUser();
  const encrypted = encryptApiKey(body.apiKey);

  const apiKey = await prisma.apiKey.upsert({
    where: { userId_provider: { userId: user.id, provider: body.provider } },
    update: { ...encrypted, isValid: true },
    create: {
      userId: user.id,
      provider: body.provider,
      ...encrypted,
    },
    select: {
      id: true,
      provider: true,
      maskedKey: true,
      isValid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(apiKey, { status: 201 });
}
