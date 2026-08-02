import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresBackupRestoreTarget, redactPostgresUrl } from "./postgres-backup-restore";

const sourceUrl = "postgresql://pilot:secret@db.internal:5432/agentforge_pilot?schema=public&sslmode=require";
const suffix = "a1b2c3d4e5f60718";

test("备份恢复目标保留 Prisma 连接配置，并为 pg 工具移除 schema 参数", () => {
  const target = createPostgresBackupRestoreTarget(sourceUrl, suffix);

  assert.equal(target.sourceDatabase, "agentforge_pilot");
  assert.equal(target.restoreDatabase, "agentforge_restore_a1b2c3d4e5f60718");
  assert.match(target.restoreUrl, /agentforge_restore_a1b2c3d4e5f60718\?schema=public&sslmode=require/);
  assert.doesNotMatch(target.pgToolSourceUrl, /schema=public/);
  assert.match(target.pgToolSourceUrl, /sslmode=require/);
  assert.match(target.adminUrl, /\/postgres\?sslmode=require$/);
});

test("备份恢复目标拒绝非 PostgreSQL、系统库和非随机后缀", () => {
  assert.throws(
    () => createPostgresBackupRestoreTarget("file:./prisma/dev.db", suffix),
    /POSTGRES_BACKUP_RESTORE_URL_INVALID/,
  );
  assert.throws(
    () => createPostgresBackupRestoreTarget("postgresql://pilot:secret@localhost:5432/postgres", suffix),
    /POSTGRES_BACKUP_RESTORE_DATABASE_INVALID/,
  );
  assert.throws(
    () => createPostgresBackupRestoreTarget(sourceUrl, "restore-target"),
    /POSTGRES_BACKUP_RESTORE_SUFFIX_INVALID/,
  );
});

test("备份恢复日志会脱敏 PostgreSQL 连接串", () => {
  assert.equal(redactPostgresUrl(sourceUrl), "postgresql://db.internal:5432/agentforge_pilot");
  assert.equal(redactPostgresUrl("not a url"), "<invalid-postgres-url>");
});
