import assert from "node:assert/strict";
import test from "node:test";
import { createBlindScoreTemplate } from "./blind-score-template";

const packet = {
  schemaVersion: 1,
  studyId: "study-2026-01",
  protocolVersion: "p2-4-v1",
  packetId: "a".repeat(64),
  entries: Array.from({ length: 60 }, (_, index) => ({
    blindId: `B${String(index + 1).padStart(3, "0")}`,
    packetCase: index + 1,
    title: `Anonymous report B${String(index + 1).padStart(3, "0")}`,
    requirement: "Build a traceable workflow with independent review, measurable acceptance criteria, recovery handling, auditability, and clear scope for the anonymous evaluation packet.",
    acceptanceFocus: ["workflow", "security", "testing"],
    reportMarkdown: "Anonymous report content with requirements, architecture, risks, evidence, tests, and delivery steps.".repeat(2),
  })),
};

test("score template binds every anonymous entry to the packet and rater", () => {
  const template = createBlindScoreTemplate(packet, "rater-a");
  assert.equal(template.packetId, packet.packetId);
  assert.equal(template.scores.length, 60);
  assert.equal(new Set(template.scores.map((score) => score.blindId)).size, 60);
  assert.equal(template.scores[0].requirementCoverage, null);
});

test("score template rejects a blank rater id", () => {
  assert.throws(() => createBlindScoreTemplate(packet, "  "), /BLIND_SCORE_TEMPLATE_RATER/);
});
