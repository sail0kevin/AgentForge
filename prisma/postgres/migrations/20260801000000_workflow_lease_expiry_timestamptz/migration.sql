-- 租约到期时间参与跨实例 fencing 判断，必须以绝对时间保存。
-- 旧列由 Node.js 以 UTC 写入，迁移时按 UTC 解释原有无时区时间，避免改变已有租约的实际到期时刻。
ALTER TABLE "DevelopmentWorkflow"
  ALTER COLUMN "leaseExpiresAt" TYPE TIMESTAMPTZ(3)
  USING "leaseExpiresAt" AT TIME ZONE 'UTC';
