import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { mapWorkspace } from "@/lib/mappers";
import { workspaceCreateSchema } from "@/lib/validation";

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    include: {
      agents: { include: { agent: true } },
      messages: { include: { tokenUsage: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(workspaces.map(mapWorkspace));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = workspaceCreateSchema.parse(await request.json());
  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      description: body.description,
      mode: body.mode,
      budgetLimit: body.budgetLimit,
      userId: user.id,
    },
  });
  return NextResponse.json(mapWorkspace({ ...workspace, agents: [], messages: [] }), { status: 201 });
}
