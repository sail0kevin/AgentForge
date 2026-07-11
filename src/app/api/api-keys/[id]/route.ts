import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const key = await prisma.apiKey.findFirst({ where: { id, userId: user.id } });
  if (!key) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
