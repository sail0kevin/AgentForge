import assert from "node:assert/strict";
import test from "node:test";
import { runBugDiagnosisWorkflow } from "./bug-diagnosis-workflow";

test("bug diagnosis keeps log matches as candidates and emits a verification plan", async () => {
  const report = await runBugDiagnosisWorkflow({
    errorLog: "Error: Missing environment variable: DATABASE_URL\n    at createClient (db.ts:12:9)",
    codeContext: [{ path: "src/lib/db.ts", content: "export const url = process.env.DATABASE_URL;" }],
  });
  assert.equal(report.status, "candidate_found");
  assert.deepEqual(report.rootCauseCandidates.map((candidate) => candidate.category), ["missing_environment"]);
  assert.equal(report.rootCauseCandidates[0].confidence, "direct_log_match");
  assert.match(report.verificationSteps[0].action, /敏感值/);
  assert.match(report.repairReport[0], /验证/);
});

test("bug diagnosis does not fabricate a root cause from an unrelated log", async () => {
  const report = await runBugDiagnosisWorkflow({
    errorLog: "Request failed after retry budget was exhausted.",
    codeContext: [{ path: "src/client.ts", content: "export async function request() { return fetch('/api'); }" }],
  });
  assert.equal(report.status, "insufficient_evidence");
  assert.deepEqual(report.rootCauseCandidates, []);
  assert.deepEqual(report.verificationSteps, []);
  assert.match(report.repairReport[0], /补充/);
});

test("bug diagnosis identifies separate direct symptoms without treating either as proven", async () => {
  const report = await runBugDiagnosisWorkflow({
    errorLog: "Cannot read properties of undefined (reading 'id')\nCannot find module 'pg'",
    codeContext: [{ path: "src/app.ts", content: "export const ready = true;" }],
  });
  assert.deepEqual(report.rootCauseCandidates.map((candidate) => candidate.category), ["null_access", "module_resolution"]);
  assert.ok(report.rootCauseCandidates.every((candidate) => candidate.confidence !== "insufficient_evidence"));
});
