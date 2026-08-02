import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * 阶段五轻量对比评测的独立 case 清单。
 *
 * 与 `blind-case-manifest.ts` 的严格 12-case/5-变体/双人盲评协议完全分离：
 * 那套协议自身文档已声明尚不具备可用于对外质量声明的条件（预算未强制、
 * 缺少第二独立评分人等），因此这里不复用其 schema，也不修改其 `.length(12)` 约束。
 *
 * 本清单只服务于"单 Agent 基线 vs 多 Agent 协作"的自动化对比，用 checklist
 * 关键点做规则匹配打分，不引入主观盲评流程。
 */
export const LightweightCaseSchema = z.object({
  caseId: z.string().regex(/^lw-case-\d{2}$/),
  category: z.enum(["ecommerce", "content-platform", "internal-admin", "website", "learning"]),
  complexity: z.enum(["medium", "high"]),
  requirement: z.string().min(60),
  // 每条 case 人工列出的必须覆盖关键点；命中率 = 命中数 / checklist.length。
  checklist: z.array(z.object({
    id: z.string().min(1).max(40),
    description: z.string().min(4).max(300),
    // 用于规则匹配的关键词/短语；任一命中即视为该关键点被覆盖。命中判定见 checklist-scoring.ts。
    keywords: z.array(z.string().min(1).max(60)).min(1).max(8),
    // 标记该关键点是否来自需求中明确提出的限制条件，用于区分"覆盖率"和"约束满足率"。
    isConstraint: z.boolean().default(false),
  })).min(5).max(10),
});

export const LightweightCaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  protocolVersion: z.string().min(1),
  frozenAt: z.string().datetime({ offset: true }),
  cases: z.array(LightweightCaseSchema).min(20).max(30),
});

export type LightweightCase = z.infer<typeof LightweightCaseSchema>;
export type LightweightCaseManifest = z.infer<typeof LightweightCaseManifestSchema>;

export function validateLightweightCaseManifest(raw: unknown) {
  const manifest = LightweightCaseManifestSchema.parse(raw);
  const ids = new Set(manifest.cases.map((item) => item.caseId));
  if (ids.size !== manifest.cases.length) throw new Error("LIGHTWEIGHT_CASE_DUPLICATE: caseId must be unique");
  for (const testCase of manifest.cases) {
    const checklistIds = new Set(testCase.checklist.map((item) => item.id));
    if (checklistIds.size !== testCase.checklist.length) {
      throw new Error(`LIGHTWEIGHT_CASE_CHECKLIST_DUPLICATE: ${testCase.caseId} has duplicate checklist ids`);
    }
  }
  return manifest;
}

export function hashLightweightCaseManifest(manifest: LightweightCaseManifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
