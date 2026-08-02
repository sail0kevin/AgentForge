import type { CandidateSolution, Finding } from "./contracts";

export type Tier1EvidenceFailure =
  | "EMPTY_EVIDENCE"
  | "DUPLICATE_EVIDENCE_REFERENCE"
  | "UNKNOWN_CANDIDATE"
  | "UNKNOWN_EVIDENCE_REFERENCE"
  | "WRONG_CANDIDATE_EVIDENCE_REFERENCE";

export type Tier1EvidenceValidation = {
  findingId: string;
  supported: boolean;
  failure: Tier1EvidenceFailure | null;
};

/**
 * Tier 1 only verifies that every cited reference belongs to the finding's candidate.
 * 它不判断自然语言结论是否由证据蕴含；该语义校验属于后续 Tier 2 NLI 的目标设计。
 */
export function validateTier1EvidenceBinding(
  finding: Finding,
  candidates: CandidateSolution[],
): Tier1EvidenceValidation {
  if (finding.evidenceRefs.length === 0) {
    return { findingId: finding.id, supported: false, failure: "EMPTY_EVIDENCE" };
  }

  if (new Set(finding.evidenceRefs).size !== finding.evidenceRefs.length) {
    return { findingId: finding.id, supported: false, failure: "DUPLICATE_EVIDENCE_REFERENCE" };
  }

  const allEvidence = new Set(
    candidates.flatMap((candidate) => candidate.decisions.flatMap((decision) => decision.evidenceRefs)),
  );
  const candidate = candidates.find((item) => item.id === finding.candidateId);
  if (!candidate) {
    return { findingId: finding.id, supported: false, failure: "UNKNOWN_CANDIDATE" };
  }
  const candidateEvidence = new Set(candidate?.decisions.flatMap((decision) => decision.evidenceRefs) ?? []);
  const unknownReference = finding.evidenceRefs.find((reference) => !allEvidence.has(reference));
  if (unknownReference) {
    return { findingId: finding.id, supported: false, failure: "UNKNOWN_EVIDENCE_REFERENCE" };
  }

  const wrongCandidateReference = finding.evidenceRefs.find((reference) => !candidateEvidence.has(reference));
  if (wrongCandidateReference) {
    return { findingId: finding.id, supported: false, failure: "WRONG_CANDIDATE_EVIDENCE_REFERENCE" };
  }

  return { findingId: finding.id, supported: true, failure: null };
}

export function partitionTier1Evidence(findings: Finding[], candidates: CandidateSolution[]) {
  const validations = findings.map((finding) => validateTier1EvidenceBinding(finding, candidates));
  const validationByFindingId = new Map(validations.map((validation) => [validation.findingId, validation]));
  return {
    validations,
    supported: findings.filter((finding) => validationByFindingId.get(finding.id)?.supported),
    unsupported: findings.filter((finding) => !validationByFindingId.get(finding.id)?.supported),
  };
}
