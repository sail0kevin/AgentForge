import assert from "node:assert/strict";
import test from "node:test";
import { runControlledReviewConformance } from "./evaluation";

test("controlled fixtures verify review contracts without overstating semantic quality", async () => {
  const report = await runControlledReviewConformance();
  assert.equal(report.sampleSize, 3);
  assert.equal(new Set(report.cases.map((item) => item.projectType)).size, 3);
  assert.deepEqual(report.aggregate, {
    candidateOrientationCoverage: 1,
    supportedFindingEvidenceRate: 1,
    evaluatorCandidateCoverage: 1,
    decisionTraceability: 1,
    humanGateAccuracy: 1,
    revisionBounded: 1,
    failureDisclosure: 1,
  });
  assert.match(report.scope, /excludes blind semantic-quality comparison/);
});
