# Tier 1 Evidence Binding Regression Gate

## 已实现

- `src/lib/review/evidence-tier1.ts` provides a pure validator shared by baseline evaluation and the final human gate.
- A finding is supported only when its `candidateId` exists and every non-duplicate evidence reference belongs to that candidate.
- `src/lib/review/evidence-tier1-fixtures.ts` freezes 12 structural cases and provides a machine-readable coverage summary. It covers single and multiple candidate-owned references, a legitimate shared-source reference, empty evidence, unknown evidence, unknown candidates, wrong-candidate references, mixed invalid references, duplicate references, failure precedence, and a valid high-impact cross-candidate conflict.
- The corpus asserts each expected failure code. Its five covered failure categories are `EMPTY_EVIDENCE`, `DUPLICATE_EVIDENCE_REFERENCE`, `UNKNOWN_CANDIDATE`, `UNKNOWN_EVIDENCE_REFERENCE`, and `WRONG_CANDIDATE_EVIDENCE_REFERENCE`.
- Unsupported blocking or high-severity findings cannot manufacture a human gate. A supported high-impact cross-candidate conflict still requires a recorded human decision.

## 已验证

The deterministic test `src/lib/review/evidence-tier1.test.ts` runs without model providers, network access, or external cost. It exercises the frozen corpus through both the pure validator and `runReviewWorkflow`.

## 待实测

- Real-model evidence-reference error rates.
- Human review of whether cited text actually supports each finding.
- Production distribution of unsupported findings and false human interventions.

## 目标设计

Tier 2 will add a local NLI or equivalent semantic validator. Tier 1 remains a necessary binding and provenance check, but it does not establish that the finding is entailed by the cited evidence.
