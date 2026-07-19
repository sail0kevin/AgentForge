import { createHash } from "node:crypto";
import { z } from "zod";

export const BlindCaseSchema = z.object({
  caseId: z.string().regex(/^case-\d{2}$/),
  category: z.enum(["website", "admin", "learning"]),
  complexity: z.enum(["medium", "high"]),
  requirement: z.string().min(60),
  acceptanceFocus: z.array(z.string().min(2)).min(3),
});

export const BlindCaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  protocolVersion: z.string().min(1),
  frozenAt: z.string().datetime({ offset: true }),
  cases: z.array(BlindCaseSchema).length(12),
});

export type BlindCaseManifest = z.infer<typeof BlindCaseManifestSchema>;

export function validateBlindCaseManifest(raw: unknown) {
  const manifest = BlindCaseManifestSchema.parse(raw);
  const ids = new Set(manifest.cases.map((item) => item.caseId));
  if (ids.size !== manifest.cases.length) throw new Error("BLIND_CASE_DUPLICATE: caseId must be unique");
  for (const category of ["website", "admin", "learning"] as const) {
    const count = manifest.cases.filter((item) => item.category === category).length;
    if (count < 4) throw new Error(`BLIND_CASE_CATEGORY_UNDERREPRESENTED: ${category} requires at least four cases`);
  }
  return manifest;
}

export function hashBlindCaseManifest(manifest: BlindCaseManifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
