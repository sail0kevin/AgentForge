/**
 * Agent CRUD API
 * GET /api/agents - list all agents for current user
 * POST /api/agents - create new agent
 */
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultUser } from "@/lib/current-user";
import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";
import type { AgentConfig } from "@/lib/types";

export async function GET() {
  try {
    const user = await getOrCreateDefaultUser();
    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const result = agents.map((agent) => {
      const meta = parseAgentMeta(agent.config);
      return {
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        color: agent.color,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        capabilityIds: meta.capabilityIds,
        apiUrl: meta.apiUrl,
        apiKey: meta.apiKey,
      };
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to list agents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = agentCreateSchema.parse(body);
    const user = await getOrCreateDefaultUser();
    const agent = await prisma.agent.create({
      data: {
        userId: user.id,
        name: data.name,
        avatar: data.avatar,
        color: data.color,
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        config: JSON.stringify({ capabilityIds: body.capabilityIds ?? [], apiUrl: data.apiUrl ?? "", apiKey: data.apiKey ?? "" }),
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
      capabilityIds: body.capabilityIds ?? [],
      apiUrl: data.apiUrl ?? "",
      apiKey: data.apiKey ?? "",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return Response.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
