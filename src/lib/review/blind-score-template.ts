import { BlindEvaluationPacketSchema } from "./blind-evaluation";

export function createBlindScoreTemplate(rawPacket: unknown, raterId: string) {
  const packet = BlindEvaluationPacketSchema.parse(rawPacket);
  if (!raterId.trim()) throw new Error("BLIND_SCORE_TEMPLATE_RATER: raterId is required");
  return {
    schemaVersion: 1 as const,
    studyId: packet.studyId,
    packetId: packet.packetId,
    raterId: raterId.trim(),
    scores: packet.entries.map((entry) => ({
      blindId: entry.blindId,
      requirementCoverage: null,
      technicalFeasibility: null,
      testability: null,
      evidenceCorrectness: null,
      clarity: null,
      humanRevisionMinutes: null,
      comments: "",
    })),
  };
}
