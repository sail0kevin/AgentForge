import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error(
    "PostgreSQL migrations are not part of the current SQLite MVP. Validate prisma/schema.postgres.prisma separately before adding a dedicated PostgreSQL migration history."
  );
  process.exit(2);
}

const isWindows = process.platform === "win32";

function runPrisma(args) {
  const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["npx.cmd", "prisma", ...args].join(" ")]
    : ["prisma", ...args];
  return spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...process.env, RUST_LOG: "info" },
    stdio: "inherit",
  });
}

const INITIAL_SCHEMA = {
  User: ["id", "email", "name", "globalBudget", "passwordHash", "createdAt", "updatedAt"],
  ApiKey: ["id", "userId", "provider", "encryptedKey", "iv", "authTag", "maskedKey", "isValid", "createdAt", "updatedAt"],
  Agent: ["id", "userId", "name", "avatar", "color", "provider", "model", "systemPrompt", "temperature", "maxTokens", "apiUrl", "config", "createdAt", "updatedAt"],
  AgentCredential: ["id", "agentId", "encryptedKey", "iv", "authTag", "maskedKey", "isValid", "createdAt", "updatedAt"],
  Workspace: ["id", "userId", "name", "description", "mode", "budgetLimit", "totalSpent", "status", "createdAt", "updatedAt"],
  WorkspaceAgent: ["workspaceId", "agentId", "isActive", "sortOrder"],
  Message: ["id", "workspaceId", "role", "agentId", "content", "replyToId", "failed", "createdAt"],
  Document: ["id", "userId", "fileName", "title", "format", "size", "content", "createdAt", "updatedAt"],
  DocumentChunk: ["id", "documentId", "content", "startLine", "endLine", "metadata", "createdAt"],
  TokenUsage: ["id", "workspaceId", "messageId", "agentId", "provider", "model", "inputTokens", "outputTokens", "costUsd", "costCny", "createdAt"],
};

function sqlitePath() {
  const raw = databaseUrl || "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) return null;
  const value = decodeURIComponent(raw.slice(5).split("?")[0]);
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function sameColumns(actual, expected) {
  return actual.length === expected.length && actual.every((column, index) => column === expected[index]);
}

function inspectLegacyDatabase(file) {
  if (!file || !existsSync(file)) return { kind: "empty" };
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    if (tables.length === 0) return { kind: "empty" };
    if (tables.includes("_prisma_migrations")) return { kind: "managed" };
    const expectedTables = Object.keys(INITIAL_SCHEMA).sort();
    if (tables.length !== expectedTables.length || tables.some((table, index) => table !== expectedTables[index])) return { kind: "unknown", tables };
    for (const [table, expected] of Object.entries(INITIAL_SCHEMA)) {
      const actual = db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
      if (!sameColumns(actual, expected)) return { kind: "unknown", tables };
    }
    return { kind: "initial" };
  } finally {
    db.close();
  }
}

const file = sqlitePath();
const legacy = inspectLegacyDatabase(file);
if (legacy.kind === "unknown") {
  console.error("Refusing to baseline an unrecognized non-empty SQLite database. Back it up and compare its schema with prisma/migrations before resolving migration history.");
  process.exit(3);
}
if (legacy.kind === "initial" && file) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backup = `${file}.backup-${timestamp}`;
  copyFileSync(file, backup);
  console.log(`Legacy initial schema detected. Backup created: ${backup}`);
  const baseline = runPrisma(["migrate", "resolve", "--applied", "20260715000000_init", "--schema", "prisma/schema.prisma"]);
  if (baseline.error) throw baseline.error;
  if (baseline.status !== 0) process.exit(baseline.status ?? 1);
}

// Prisma 7.8 schema engine intermittently fails to initialize SQLite on Windows
// without Rust logging enabled. Keep the workaround scoped to migration commands.
const result = runPrisma(["migrate", "deploy", "--schema", "prisma/schema.prisma"]);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
