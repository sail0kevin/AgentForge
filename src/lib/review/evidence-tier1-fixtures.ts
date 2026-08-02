import type { Finding } from "./contracts";
import type { Tier1EvidenceFailure } from "./evidence-tier1";

export type Tier1EvidenceFixture = {
  id: string;
  scenario: string;
  candidateId?: string;
  evidenceRefs: string[];
  severity: Finding["severity"];
  relatedCandidateIds: string[];
  expected: "supported" | "ignored";
  expectedFailure: Tier1EvidenceFailure | null;
};

export type Tier1EvidenceCorpusCoverage = {
  totalCases: number;
  supportedCases: number;
  ignoredCases: number;
  coveredFailures: Tier1EvidenceFailure[];
};

/**
 * 冻结错误案例集只覆盖 Tier 1 的引用绑定，不作为语义蕴含或真实模型质量的数据集。
 * `deliveryRef` 与 `qualityRef` 由测试中的确定性候选方案提供。
 */
export const TIER1_EVIDENCE_FIXTURES: readonly Tier1EvidenceFixture[] = [
  { id: "exact-candidate-reference", scenario: "单个候选方案自有引用", evidenceRefs: ["deliveryRef"], severity: "medium", relatedCandidateIds: [], expected: "supported", expectedFailure: null },
  { id: "multiple-candidate-references", scenario: "多个候选方案自有引用", evidenceRefs: ["deliveryRef", "deliverySecondaryRef"], severity: "medium", relatedCandidateIds: [], expected: "supported", expectedFailure: null },
  { id: "shared-source-reference", scenario: "两个候选方案均持有的共享来源引用", evidenceRefs: ["sharedSourceRef"], severity: "medium", relatedCandidateIds: [], expected: "supported", expectedFailure: null },
  { id: "empty-evidence", scenario: "空引用优先于其他字段判断", evidenceRefs: [], severity: "blocking", relatedCandidateIds: ["candidate-quality"], expected: "ignored", expectedFailure: "EMPTY_EVIDENCE" },
  { id: "unknown-reference", scenario: "候选方案中不存在的引用", evidenceRefs: ["unknownRef"], severity: "high", relatedCandidateIds: ["candidate-quality"], expected: "ignored", expectedFailure: "UNKNOWN_EVIDENCE_REFERENCE" },
  { id: "unknown-candidate", scenario: "Finding 指向不存在的候选方案", candidateId: "candidate-missing", evidenceRefs: ["deliveryRef"], severity: "high", relatedCandidateIds: ["candidate-quality"], expected: "ignored", expectedFailure: "UNKNOWN_CANDIDATE" },
  { id: "wrong-candidate-reference", scenario: "引用只属于另一候选方案", evidenceRefs: ["qualityRef"], severity: "high", relatedCandidateIds: ["candidate-quality"], expected: "ignored", expectedFailure: "WRONG_CANDIDATE_EVIDENCE_REFERENCE" },
  { id: "mixed-valid-and-unknown", scenario: "合法引用与幻觉引用混合", evidenceRefs: ["deliveryRef", "unknownRef"], severity: "medium", relatedCandidateIds: [], expected: "ignored", expectedFailure: "UNKNOWN_EVIDENCE_REFERENCE" },
  { id: "mixed-valid-and-wrong-candidate", scenario: "合法引用与另一候选方案引用混合", evidenceRefs: ["deliveryRef", "qualityRef"], severity: "medium", relatedCandidateIds: [], expected: "ignored", expectedFailure: "WRONG_CANDIDATE_EVIDENCE_REFERENCE" },
  { id: "duplicate-reference", scenario: "同一引用重复出现", evidenceRefs: ["deliveryRef", "deliveryRef"], severity: "medium", relatedCandidateIds: [], expected: "ignored", expectedFailure: "DUPLICATE_EVIDENCE_REFERENCE" },
  { id: "duplicate-and-unknown-reference", scenario: "重复引用的失败优先级高于未知引用", evidenceRefs: ["deliveryRef", "deliveryRef", "unknownRef"], severity: "medium", relatedCandidateIds: [], expected: "ignored", expectedFailure: "DUPLICATE_EVIDENCE_REFERENCE" },
  { id: "supported-cross-candidate-conflict", scenario: "有归属证据的高影响跨候选冲突", evidenceRefs: ["deliveryRef"], severity: "high", relatedCandidateIds: ["candidate-quality"], expected: "supported", expectedFailure: null },
] as const;

/**
 * 生成可审计的 Tier 1 覆盖摘要，不把结构性案例数量解释为模型质量指标。
 */
export function summarizeTier1EvidenceCorpus(): Tier1EvidenceCorpusCoverage {
  const coveredFailures = Array.from(new Set(
    TIER1_EVIDENCE_FIXTURES.flatMap((fixture) => fixture.expectedFailure ? [fixture.expectedFailure] : []),
  )).sort();
  const supportedCases = TIER1_EVIDENCE_FIXTURES.filter((fixture) => fixture.expected === "supported").length;
  return {
    totalCases: TIER1_EVIDENCE_FIXTURES.length,
    supportedCases,
    ignoredCases: TIER1_EVIDENCE_FIXTURES.length - supportedCases,
    coveredFailures,
  };
}
