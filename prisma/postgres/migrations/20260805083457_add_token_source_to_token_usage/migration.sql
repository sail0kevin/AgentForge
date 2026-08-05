-- tokenSource 标记 TokenUsage 的 token 数是 provider 返回还是本地估算。
-- 默认 "estimated"：现有行回填为估算，符合它们实际来源。
ALTER TABLE "TokenUsage" ADD COLUMN "tokenSource" TEXT NOT NULL DEFAULT 'estimated';
