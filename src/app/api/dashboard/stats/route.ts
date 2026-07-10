/**
 * Dashboard 统计数据接口
 *
 * 作为整个 Dashboard 看板的数据源：聚合 Agent、消息、Token 消耗等关键指标，
 * 让前端 Dashboard 展示真实数据而非占位色块。
 */
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/stats
 *
 * 作用：返回聚合统计数据供 Dashboard 展示
 * 原理：
 *   1. 统计 Agent 总数
 *   2. 统计消息总数（user + assistant）
 *   3. 统计 Token 总消耗（从 TokenUsage 表聚合）
 *   4. 按供应商分组统计
 *
 * 返回：{ agentCount, messageCount, tokenStats, byProvider }
 */
export async function GET() {
  try {
    const [agentCount, userMessages, assistantMessages, tokenAgg, byProvider] = await Promise.all([
      prisma.agent.count(),
      prisma.message.count({ where: { role: "user" } }),
      prisma.message.count({ where: { role: "assistant" } }),
      prisma.tokenUsage.aggregate({
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      }),
      prisma.agent.groupBy({
        by: ["provider"],
        _count: { _all: true },
      }),
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
      byProvider: byProvider.map((item) => ({
        provider: item.provider,
        count: item._count._all,
      })),
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }
}