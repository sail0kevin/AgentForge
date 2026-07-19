import type { Chunk } from "./chunker";
import type { RetrievalFixture } from "./evaluation";

/**
 * Deterministic retrieval fixtures used for the resume evidence baseline.
 * They measure retrieval/citation plumbing only; they are not a real-model quality claim.
 */
const topics = [
  ["rbac", "role permission audit log", "Admin security"],
  ["forms", "form field validation error summary", "Web accessibility"],
  ["timer", "timer pause resume recovery", "Learning state"],
  ["export", "markdown report export source citation", "Report export"],
  ["budget", "token budget cost limit", "Runtime budget"],
  ["timeout", "provider timeout abort request", "Provider reliability"],
  ["checkpoint", "checkpoint interrupt resume workflow", "Workflow recovery"],
  ["review", "delivery quality candidate cross review", "Candidate review"],
  ["evidence", "finding evidence source manifest", "Evidence chain"],
  ["isolation", "session user data isolation", "Data isolation"],
  ["tools", "tool permission call limit audit", "Controlled tools"],
  ["clarification", "clarification request bounded planning", "Planning recovery"],
] as const;

const metadata = (title: string, headingPath: string) => ({
  documentTitle: title,
  headingPath,
  sourceVersion: "fixture-1",
  license: "project",
});

export const resumeFixtureChunks: Chunk[] = topics.map(([id, terms, title], index) => ({
  id: `fixture-${id}`,
  documentId: `doc-${id}`,
  content: `This fixture covers ${terms}.`,
  startLine: index * 3,
  endLine: index * 3 + 2,
  metadata: metadata(title, `Evidence > ${title}`),
}));

export const resumeFixtures: RetrievalFixture[] = topics.map(([id, terms]) => ({
  id,
  query: terms,
  relevantChunkIds: [`fixture-${id}`],
}));

export const resumeNoiseChunks: Chunk[] = [
  "General project workflow notes and implementation context.",
  "General project report notes and implementation context.",
  "General project evidence notes and implementation context.",
  "General project planning notes and implementation context.",
].map((content, index) => ({
  id: `noise-${index + 1}`,
  documentId: `noise-doc-${index + 1}`,
  content,
  startLine: index,
  endLine: index + 1,
  metadata: metadata("General project notes", "Noise > General"),
}));
