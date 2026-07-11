import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { encryptApiKey } from "@/lib/security/crypto";
import { agentUpdateSchema, parseAgentMeta } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

type AgentWithCredential = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  apiUrl: string;
  config: string;
  credential?: { maskedKey: string; isValid: boolean } | null;
};

type LegacyCredential = { maskedKey: string; isValid: boolean } | null | undefined;

// DTO 只返回密钥是否存在和脱敏展示值，绝不回传 API Key 原文或加密载荷。
function toAgentDto(agent: AgentWithCredential, legacyCredential?: LegacyCredential) {
  const meta = parseAgentMeta(agent.config);
  const credential = agent.credential?.isValid ? agent.credential : legacyCredential?.isValid ? legacyCredential : null;
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
    // 先使用专用字段；旧数据仍能从 config 的 apiUrl 无缝读取。
    apiUrl: agent.apiUrl || meta.apiUrl,
    credentialConfigured: Boolean(credential),
    maskedKey: credential?.maskedKey ?? null,
  };
}

function unauthorized() {
  return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const agent = await prisma.agent.findFirst({
      where: { id, userId: user.id },
      include: { credential: { select: { maskedKey: true, isValid: true } } },
    });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
    const legacyCredential = await prisma.apiKey.findFirst({
      where: { userId: user.id, provider: agent.provider, isValid: true },
      select: { maskedKey: true, isValid: true },
    });
    return Response.json(toAgentDto(agent, legacyCredential));
  } catch {
    return Response.json({ error: "Failed to get agent" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const body = await request.json();
    const data = agentUpdateSchema.parse(body);
    const existing = await prisma.agent.findFirst({ where: { id, userId: user.id } });
    if (!existing) return Response.json({ error: "Agent not found" }, { status: 404 });

    const existingMeta = parseAgentMeta(existing.config);
    const nextMeta = {
      capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : existingMeta.capabilityIds,
    };
    // 空 key 是“不修改”而不是“清除”，防止编辑普通配置时意外丢失凭证。
    const encryptedCredential = data.apiKey ? encryptApiKey(data.apiKey) : null;
    const agent = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.temperature !== undefined && { temperature: data.temperature }),
        ...(data.maxTokens !== undefined && { maxTokens: data.maxTokens }),
        ...(data.apiUrl !== undefined && { apiUrl: data.apiUrl }),
        config: JSON.stringify(nextMeta),
        // upsert 让首次填写和替换已有 Agent 凭证使用同一条安全写入路径。
        ...(encryptedCredential && { credential: { upsert: { create: encryptedCredential, update: encryptedCredential } } }),
      },
      include: { credential: { select: { maskedKey: true, isValid: true } } },
    });
    const legacyCredential = await prisma.apiKey.findFirst({
      where: { userId: user.id, provider: agent.provider, isValid: true },
      select: { maskedKey: true, isValid: true },
    });
    return Response.json(toAgentDto(agent, legacyCredential));
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues.map((issue) => issue.message).join(", ") }, { status: 400 });
    return Response.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    // AgentCredential 通过 onDelete: Cascade 随 Agent 原子删除，不会留下孤立密文。
    const deleted = await prisma.agent.deleteMany({ where: { id, userId: user.id } });
    if (deleted.count === 0) return Response.json({ error: "Agent not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}
