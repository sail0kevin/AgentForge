import { spawnSync } from "node:child_process";

const placeholderPattern = /replace-with|change-before-production|your[-_ ]?(api[-_ ]?)?key|example|placeholder/i;
const currentTreePatterns = ["sk-[A-Za-z0-9_-]{20,}", "sk-ant-[A-Za-z0-9_-]{20,}", "AIza[A-Za-z0-9_-]{20,}", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"];

function git(args) {
  return spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
}

function secretState(name, required) {
  const value = process.env[name];
  if (!value) return required ? { status: "missing", length: 0 } : { status: "not-set", length: 0 };
  if (placeholderPattern.test(value)) return { status: "placeholder", length: value.length };
  if (value.length < 32) return { status: "too-short", length: value.length };
  return { status: "ready", length: value.length };
}

function printUsage() {
  console.log("Usage: node --env-file=.env scripts/verify-secret-hygiene.mjs [--production]");
  console.log("Checks hygiene without printing secret values. --production requires SESSION_SECRET and ENCRYPTION_MASTER_KEY.");
}

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

const production = process.argv.includes("--production") || process.env.APP_AUTH_MODE === "session" || process.env.NODE_ENV === "production";
const failures = [];
const warnings = [];

const trackedEnv = git(["ls-files", "--error-unmatch", ".env"]);
if (trackedEnv.status === 0) failures.push(".env is tracked by Git");
else if (trackedEnv.status === 1) console.log("PASS git: .env is not tracked");
else failures.push("unable to inspect Git tracking for .env");

const grep = git(["grep", "-I", "-l", "-E", currentTreePatterns.join("|"), "--", ".", ":(exclude).env.example"]);
if (grep.status === 0) failures.push(`possible secret material in tracked files (${grep.stdout.trim().split(/\r?\n/).filter(Boolean).length} file(s)); inspect paths privately`);
else if (grep.status === 1) console.log("PASS git: no common credential signatures in tracked files");
else failures.push("unable to scan tracked files for credential signatures");

for (const name of ["SESSION_SECRET", "ENCRYPTION_MASTER_KEY"]) {
  const state = secretState(name, production);
  console.log(`${state.status === "ready" || (!production && state.status === "not-set") ? "PASS" : "FAIL"} runtime: ${name} is ${state.status} (length=${state.length})`);
  if (production && state.status !== "ready") failures.push(`${name} is not ready for session/production mode`);
  if (!production && state.status !== "ready" && state.status !== "not-set") warnings.push(`${name} should be replaced before a session/production deployment`);
}

for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"]) {
  const state = secretState(name, false);
  console.log(`INFO runtime: ${name} is ${state.status} (length=${state.length})`);
  if (state.status === "placeholder" || state.status === "too-short") warnings.push(`${name} is configured but does not meet the minimum hygiene check`);
}

console.log("INFO external: provider-side revocation and historical-key rotation cannot be proved from this repository; record their completion without storing secrets.");
for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length > 0) process.exitCode = 1;
