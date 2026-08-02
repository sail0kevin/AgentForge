-- 分布式工作流租约：owner 标识持有实例，token 用于拒绝失效实例的滞后写入。
ALTER TABLE "DevelopmentWorkflow" ADD COLUMN "leaseOwnerId" TEXT;
ALTER TABLE "DevelopmentWorkflow" ADD COLUMN "leaseToken" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "DevelopmentWorkflow_leaseExpiresAt_idx" ON "DevelopmentWorkflow"("leaseExpiresAt");
