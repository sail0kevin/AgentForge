import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRetrieval } from "./evaluation";
import { resumeFixtureChunks, resumeFixtures, resumeNoiseChunks } from "./resume-fixtures";

test("resume evidence fixtures cover twelve retrieval intents", () => {
  const metrics = evaluateRetrieval(resumeFixtures, resumeFixtureChunks, 1);
  assert.equal(resumeFixtures.length, 12);
  assert.deepEqual(metrics, {
    recallAtK: 1,
    meanReciprocalRank: 1,
    irrelevantResultRate: 0,
    citationCompleteness: 1,
  });
});

test("resume evidence fixtures retain relevant chunks under shared noise", () => {
  const metrics = evaluateRetrieval(resumeFixtures, [...resumeFixtureChunks, ...resumeNoiseChunks], 5);
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.meanReciprocalRank, 1);
  assert.equal(metrics.citationCompleteness, 1);
  assert.ok(metrics.irrelevantResultRate > 0);
  assert.ok(metrics.irrelevantResultRate < 1);
});
