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
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" },
    select: { id: true, provider: true, maskedKey: true, isValid: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(apiKeys);
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
