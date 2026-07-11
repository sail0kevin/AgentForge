import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });

    const [agentCount, userMessages, assistantMessages, tokenAgg, byProvider] = await Promise.all([
      prisma.agent.count({ where: { userId: user.id } }),
      prisma.message.count({ where: { role: "user", workspace: { userId: user.id } } }),
      prisma.message.count({ where: { role: "assistant", workspace: { userId: user.id } } }),
      prisma.tokenUsage.aggregate({
        where: { workspace: { userId: user.id } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      }),
      prisma.agent.groupBy({ where: { userId: user.id }, by: ["provider"], _count: { _all: true } }),
    ]);

    return Response.json({
      agentCount,
      messageCount: userMessages + assistantMessages,
      userMessages,
      assistantMessages,
      tokenStats: {
        inputTokens: tokenAgg._sum.inputTokens ?? 0,
        outputTokens: tokenAgg._sum.outputTokens ?? 0,
        costUsd: tokenAgg._sum.costUsd ?? 0,
      },
      byProvider: byProvider.map((item) => ({ provider: item.provider, count: item._count._all })),
    }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }
}
