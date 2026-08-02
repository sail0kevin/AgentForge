import type { CandidateSolution, Finding } from "./contracts";
import { partitionTier1Evidence } from "./evidence-tier1";

export type Tier2VerificationLabel = "entailed" | "not_entailed" | "unknown";

export type Tier2Verification = {
  label: Tier2VerificationLabel;
  reason: string;
};

export type Tier2EvidenceVerifier = (input: {
  finding: Finding;
  candidate: CandidateSolution;
}) => Promise<Tier2Verification>;

export type TieredEvidenceAssessment = {
  kind: "tiered_evidence_assessment";
  status: "not_configured" | "verified" | "rejected" | "error";
  tier1SupportedFindingIds: string[];
  tier2EntailedFindingIds: string[];
  tier2RejectedFindingIds: string[];
  tier2UnknownFindingIds: string[];
  effectiveSupportedFindingIds: string[];
  effectiveSupportKind: "tier1_structural" | "tier2_semantic";
  failures: Array<{ findingId: string; code: "TIER2_VERIFIER_FAILED" | "TIER2_RESULT_INVALID" }>;
  reasons: string[];
  limitations: string[];
};

/**
 * Tier 2 只验证已经通过 Tier 1 绑定的 Finding；未配置时绝不伪造语义结论。
 * 验证器的真实模型、阈值和运行环境由调用方注入，核心工作流不依赖具体 NLI 实现。
 */
export async function assessTieredEvidence(input: {
  findings: Finding[];
  candidates: CandidateSolution[];
  verifier?: Tier2EvidenceVerifier;
}): Promise<TieredEvidenceAssessment> {
  const { supported } = partitionTier1Evidence(input.findings, input.candidates);
  const tier1SupportedFindingIds = supported.map((finding) => finding.id);
  const limitations = [
    "Tier 1 verifies reference binding only; it does not establish semantic entailment.",
    "Tier 2 results require a configured verifier and real evaluation data; this contract does not calibrate model quality.",
  ];

  if (!input.verifier) {
    return {
      kind: "tiered_evidence_assessment",
      status: "not_configured",
      tier1SupportedFindingIds,
      tier2EntailedFindingIds: [],
      tier2RejectedFindingIds: [],
      tier2UnknownFindingIds: [],
      effectiveSupportedFindingIds: tier1SupportedFindingIds,
      effectiveSupportKind: "tier1_structural",
      failures: [],
      reasons: ["No Tier 2 verifier is configured; structural Tier 1 evidence remains labelled separately."],
      limitations,
    };
  }

  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const results = await Promise.allSettled(supported.map(async (finding) => {
    const candidate = candidateById.get(finding.candidateId);
    if (!candidate) throw new Error("TIER2_CANDIDATE_MISSING");
    const result = await input.verifier!({ finding, candidate });
    if (!result || !["entailed", "not_entailed", "unknown"].includes(result.label) || result.reason.trim().length < 5) {
      throw new TypeError("TIER2_RESULT_INVALID");
    }
    return { findingId: finding.id, ...result };
  }));
  const entailedFindingIds: string[] = [];
  const rejectedFindingIds: string[] = [];
  const unknownFindingIds: string[] = [];
  const failures: TieredEvidenceAssessment["failures"] = [];

  results.forEach((result, index) => {
    const findingId = supported[index]!.id;
    if (result.status === "rejected") {
      failures.push({ findingId, code: result.reason instanceof TypeError ? "TIER2_RESULT_INVALID" : "TIER2_VERIFIER_FAILED" });
      return;
    }
    if (result.value.label === "entailed") entailedFindingIds.push(findingId);
    else if (result.value.label === "not_entailed") rejectedFindingIds.push(findingId);
    else unknownFindingIds.push(findingId);
  });

  const status = failures.length > 0
    ? "error"
    : rejectedFindingIds.length === supported.length && supported.length > 0
      ? "rejected"
      : "verified";
  return {
    kind: "tiered_evidence_assessment",
    status,
    tier1SupportedFindingIds,
    tier2EntailedFindingIds: entailedFindingIds,
    tier2RejectedFindingIds: rejectedFindingIds,
    tier2UnknownFindingIds: unknownFindingIds,
    // 配置 Tier 2 后只有明确蕴含的 Finding 才能进入语义支持集合；unknown 不升级为支持。
    effectiveSupportedFindingIds: entailedFindingIds,
    effectiveSupportKind: "tier2_semantic",
    failures,
    reasons: [
      `Tier 2 returned entailed=${entailedFindingIds.length}, not_entailed=${rejectedFindingIds.length}, unknown=${unknownFindingIds.length}.`,
      ...(failures.length > 0 ? ["Some Tier 2 checks failed; failed checks are not promoted to semantic support."] : []),
    ],
    limitations,
  };
}
