import { evaluateRetrieval } from "../src/lib/rag/evaluation";
import { resumeFixtureChunks, resumeFixtures, resumeNoiseChunks } from "../src/lib/rag/resume-fixtures";

const baseline = evaluateRetrieval(resumeFixtures, resumeFixtureChunks, 1);
const noisyRecallAt5 = evaluateRetrieval(resumeFixtures, [...resumeFixtureChunks, ...resumeNoiseChunks], 5);

console.log(JSON.stringify({
  dataset: "agentforge-resume-fixtures",
  fixtureCount: resumeFixtures.length,
  scenarios: {
    cleanRecallAt1: baseline,
    sharedNoiseRecallAt5: noisyRecallAt5,
  },
  limitation: "Deterministic retrieval/citation plumbing baseline; not a real-model quality claim.",
}, null, 2));
