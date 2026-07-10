import { NextResponse } from "next/server";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { demoWorkspace } from "@/lib/demo-data";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await getOrCreateDefaultUser();

  const workspace = await prisma.workspace.upsert({
    where: { id: demoWorkspace.id },
    update: {
      name: demoWorkspace.name,
      description: demoWorkspace.description,
      mode: demoWorkspace.mode,
      budgetLimit: demoWorkspace.budgetLimit,
    },
    create: {
      id: demoWorkspace.id,
      userId: user.id,
      name: demoWorkspace.name,
      description: demoWorkspace.description,
      mode: demoWorkspace.mode,
      budgetLimit: demoWorkspace.budgetLimit,
    },
  });

  await prisma.workspaceAgent.deleteMany({ where: { workspaceId: workspace.id } });

  return NextResponse.json({ ok: true, userId: user.id, workspaceId: workspace.id, agentCount: 0 });
}
