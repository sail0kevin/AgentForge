export type PostgresBackupRestoreTarget = {
  sourceDatabase: string;
  sourceUrl: string;
  adminUrl: string;
  restoreDatabase: string;
  restoreUrl: string;
  pgToolSourceUrl: string;
  pgToolRestoreUrl: string;
};

function parsePostgresUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("POSTGRES_BACKUP_RESTORE_URL_INVALID: connection string must be a valid URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("POSTGRES_BACKUP_RESTORE_URL_INVALID: connection string must use postgres or postgresql");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database || database === "postgres") {
    throw new Error("POSTGRES_BACKUP_RESTORE_DATABASE_INVALID: use a dedicated application test database");
  }

  return { parsed, database };
}

function withDatabase(url: URL, database: string) {
  const next = new URL(url.toString());
  next.pathname = `/${database}`;
  return next;
}

/**
 * Prisma 的 PostgreSQL URL 可带 schema=public；pg_dump / pg_restore 不识别这个 Prisma 专用参数。
 * 保留其它连接参数，避免演练与目标连接的 TLS 等配置发生漂移。
 */
function toPgToolUrl(url: URL) {
  const next = new URL(url.toString());
  next.searchParams.delete("schema");
  return next.toString();
}

/**
 * 根据显式测试库连接串生成一次性恢复库连接。恢复库名称只来自十六进制随机后缀，
 * 因此后续 CREATE/DROP DATABASE 不会拼接用户可控的 SQL 标识符。
 */
export function createPostgresBackupRestoreTarget(sourceUrl: string, suffix: string): PostgresBackupRestoreTarget {
  if (!/^[a-f0-9]{16,64}$/i.test(suffix)) {
    throw new Error("POSTGRES_BACKUP_RESTORE_SUFFIX_INVALID: suffix must be a hexadecimal random value");
  }

  const { parsed: source, database: sourceDatabase } = parsePostgresUrl(sourceUrl);
  const restoreDatabase = `agentforge_restore_${suffix.toLowerCase()}`;
  const restore = withDatabase(source, restoreDatabase);
  const admin = withDatabase(source, "postgres");

  return {
    sourceDatabase,
    sourceUrl: source.toString(),
    adminUrl: toPgToolUrl(admin),
    restoreDatabase,
    restoreUrl: restore.toString(),
    pgToolSourceUrl: toPgToolUrl(source),
    pgToolRestoreUrl: toPgToolUrl(restore),
  };
}

/** 终端日志只能显示端点和库名，不能回显账号、密码或查询参数。 */
export function redactPostgresUrl(value: string) {
  try {
    const parsed = new URL(value);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return `${parsed.protocol}//${parsed.host}/${database}`;
  } catch {
    return "<invalid-postgres-url>";
  }
}
