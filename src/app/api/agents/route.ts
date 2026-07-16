import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { decryptApiKey, encryptApiKey } from "@/lib/security/crypto";
import { agentCreateSchema, parseAgentMeta } from "@/lib/validation";

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
  credential?: { maskedKey: string; keyLength: number; isValid: boolean; encryptedKey: string; iv: string; authTag: string } | null;
};

type LegacyCredential = { maskedKey: string; keyLength: number; isValid: boolean; encryptedKey: string; iv: string; authTag: string } | null | undefined;

function credentialLength(credential: LegacyCredential) {
  if (!credential) return null;
  if (credential.keyLength > 0) return credential.keyLength;
  // 旧记录在新增 keyLength 字段前已存在。只在服务端临时解密以计算长度，
  // 结果仍只作为数字返回，绝不把明文或密文发送到浏览器。
  try {
    return decryptApiKey(credential.encryptedKey, credential.iv, credential.authTag).length;
  } catch {
    return 0;
  }
}

// DTO 只提供脱敏密钥和配置状态，绝不把加密字段或明文密钥发送到浏览器。
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
    // 新字段优先；数据库尚未迁移的旧记录继续读取 config 中的地址。
    apiUrl: agent.apiUrl || meta.apiUrl,
    credentialConfigured: Boolean(credential),
    maskedKey: credential?.maskedKey ?? null,
    keyLength: credentialLength(credential),
  };
}

/** GET /api/agents - list agents without ever exposing raw provider credentials. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const [agents, legacyKeys] = await Promise.all([
      prisma.agent.findMany({
        where: { userId: user.id },
        include: { credential: { select: { maskedKey: true, keyLength: true, isValid: true, encryptedKey: true, iv: true, authTag: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // 旧版按用户和供应商存储的 Key 仅作为兼容回退，新的 Agent 凭证始终优先。
      prisma.apiKey.findMany({ where: { userId: user.id, isValid: true }, select: { provider: true, maskedKey: true, keyLength: true, isValid: true, encryptedKey: true, iv: true, authTag: true } }),
    ]);
    const legacyKeysByProvider = new Map(legacyKeys.map((key) => [key.provider, key]));
    return Response.json(agents.map((agent) => toAgentDto(agent, legacyKeysByProvider.get(agent.provider))), { status: 200 });
  } catch {
    return Response.json({ error: "无法加载智能体" }, { status: 500 });
  }
}

/** POST /api/agents - creates an agent and stores a supplied key in its own encrypted credential record. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = agentCreateSchema.parse(body);
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    // 只在服务端将明文转换为 AES-GCM 密文，后续 Prisma 写入不会包含原始 API Key。
    const encryptedCredential = data.apiKey ? encryptApiKey(data.apiKey) : null;
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
        apiUrl: data.apiUrl,
        // config 保留非敏感的能力配置，地址已迁移至专用列。
        config: JSON.stringify({ capabilityIds: body.capabilityIds ?? [] }),
        credential: encryptedCredential ? { create: encryptedCredential } : undefined,
      },
      include: { credential: { select: { maskedKey: true, keyLength: true, isValid: true, encryptedKey: true, iv: true, authTag: true } } },
    });
    const legacyCredential = await prisma.apiKey.findFirst({
      where: { userId: user.id, provider: agent.provider, isValid: true },
      select: { maskedKey: true, keyLength: true, isValid: true, encryptedKey: true, iv: true, authTag: true },
    });
    return Response.json(toAgentDto(agent, legacyCredential), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues.map((issue) => issue.message).join(", ") }, { status: 400 });
    return Response.json({ error: "创建智能体失败" }, { status: 500 });
  }
}
