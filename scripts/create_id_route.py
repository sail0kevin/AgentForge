import os

# Create the [id] route for agents
dirpath = r'G:\projects\agent-learning\projects\Multi-Agent-Workspace\src\app\api\agents\[id]'
os.makedirs(dirpath, exist_ok=True)

filepath = os.path.join(dirpath, 'route.ts')

content = '''/**
 * Single Agent API
 * GET /api/agents/[id] - get one agent
 * PUT /api/agents/[id] - update agent
 * DELETE /api/agents/[id] - delete agent
 */
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { agentUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getOrCreateDefaultUser();
    const agent = await prisma.agent.findFirst({ where: { id, userId: user.id } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
    return Response.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilityIds: JSON.parse(agent.config || "[]"),
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to get agent" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = agentUpdateSchema.parse(body);
    const user = await getOrCreateDefaultUser();
    const existing = await prisma.agent.findFirst({ where: { id, userId: user.id } });
    if (!existing) return Response.json({ error: "Agent not found" }, { status: 404 });
    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
        ...(body.capabilityIds !== undefined && { config: JSON.stringify(body.capabilityIds) }),
      },
    });
    return Response.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      color: agent.color,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilityIds: body.capabilityIds ?? JSON.parse(agent.config || "[]"),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return Response.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getOrCreateDefaultUser();
    const existing = await prisma.agent.findFirst({ where: { id, userId: user.id } });
    if (!existing) return Response.json({ error: "Agent not found" }, { status: 404 });
    await prisma.agent.delete({ where: { id } });
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}
'''

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Created:', filepath)