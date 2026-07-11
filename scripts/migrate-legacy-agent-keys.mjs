#!/usr/bin/env node
/**
 * 将旧版 Agent.config.apiKey 迁移到加密 ApiKey 表。
 *
 * 默认仅扫描：不会显示原始 Key，也不会修改数据库。
 * 只有显式传入 --apply，且所有同用户/Provider 分组都没有冲突时才会写入并清除旧字段。
 */
import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const rawDatabaseUrl = process.env.DATABASE_URL || path.join(process.cwd(), "prisma", "dev.db");

if (rawDatabaseUrl.startsWith("postgres://") || rawDatabaseUrl.startsWith("postgresql://")) {
  console.error("This migration helper currently supports SQLite only. Use a reviewed PostgreSQL migration before applying to PostgreSQL.");
  process.exit(2);
}

const databasePath = rawDatabaseUrl.startsWith("file:") ? rawDatabaseUrl.slice(5) : rawDatabaseUrl;
const masterKey = process.env.ENCRYPTION_MASTER_KEY || (process.env.NODE_ENV !== "production" ? "local-development-secret-change-before-production" : "");
if (!masterKey) {
  console.error("ENCRYPTION_MASTER_KEY is required to apply a legacy credential migration.");
  process.exit(2);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function encryptApiKey(apiKey) {
  const key = crypto.createHash("sha256").update(masterKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    maskedKey: apiKey.length <= 8 ? "****" : `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`,
  };
}

const db = new Database(databasePath);
try {
  const agents = db.prepare("SELECT id, userId, provider, config FROM Agent").all();
  const groups = new Map();
  for (const agent of agents) {
    try {
      const config = JSON.parse(agent.config || "{}");
      const apiKey = config && !Array.isArray(config) && typeof config.apiKey === "string" ? config.apiKey.trim() : "";
      if (!apiKey) continue;
      const groupKey = `${agent.userId}:${agent.provider}`;
      const group = groups.get(groupKey) || { userId: agent.userId, provider: agent.provider, entries: [] };
      group.entries.push({ id: agent.id, apiKey, fingerprint: fingerprint(apiKey), config });
      groups.set(groupKey, group);
    } catch {
      console.warn(`Skipped malformed Agent.config for agent ${agent.id}.`);
    }
  }

  const report = [];
  const conflicts = [];
  for (const group of groups.values()) {
    const fingerprints = [...new Set(group.entries.map((entry) => entry.fingerprint))];
    const existing = db.prepare("SELECT id FROM ApiKey WHERE userId = ? AND provider = ?").get(group.userId, group.provider);
    const item = {
      userId: group.userId,
      provider: group.provider,
      agentIds: group.entries.map((entry) => entry.id),
      distinctKeyCount: fingerprints.length,
      fingerprints,
      existingCredential: Boolean(existing),
    };
    report.push(item);
    if (fingerprints.length > 1) conflicts.push(item);
  }

  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", legacyCredentialGroups: report.length, conflicts, report }, null, 2));
  if (conflicts.length > 0) {
    console.error("Migration stopped: one or more user/provider groups contain different legacy credentials. Resolve them manually; no data was changed.");
    process.exitCode = 3;
  } else if (apply) {
    const migrate = db.transaction(() => {
      for (const group of groups.values()) {
        const existing = db.prepare("SELECT id FROM ApiKey WHERE userId = ? AND provider = ?").get(group.userId, group.provider);
        // 已有加密凭证是唯一权威来源；只清除同值旧字段，不覆盖用户后来保存的新 Key。
        if (!existing) {
          const encrypted = encryptApiKey(group.entries[0].apiKey);
          db.prepare("INSERT INTO ApiKey (id, userId, provider, encryptedKey, iv, authTag, maskedKey, isValid, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(`legacy-${crypto.randomUUID()}`, group.userId, group.provider, encrypted.encryptedKey, encrypted.iv, encrypted.authTag, encrypted.maskedKey, 1, new Date().toISOString(), new Date().toISOString());
        }
        for (const entry of group.entries) {
          delete entry.config.apiKey;
          db.prepare("UPDATE Agent SET config = ?, updatedAt = ? WHERE id = ?").run(JSON.stringify(entry.config), new Date().toISOString(), entry.id);
        }
      }
    });
    migrate();
    console.log("Migration applied. Re-run with --dry-run to confirm legacyCredentialGroups is 0.");
  }
} finally {
  db.close();
}
