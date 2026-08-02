-- 产品/UI报告组是主工作流的新交付物；传统 ReportArtifact 继续保留用于历史兼容。
CREATE TABLE "ProductUIReportGroup" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewWorkflowId" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "reportsJson" TEXT NOT NULL,
    "comparisonJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "feedbackJson" TEXT NOT NULL DEFAULT '[]',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductUIReportGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductUIReportGroup_userId_groupId_key" ON "ProductUIReportGroup"("userId", "groupId");
CREATE INDEX "ProductUIReportGroup_userId_createdAt_idx" ON "ProductUIReportGroup"("userId", "createdAt");
CREATE INDEX "ProductUIReportGroup_reviewWorkflowId_createdAt_idx" ON "ProductUIReportGroup"("reviewWorkflowId", "createdAt");

ALTER TABLE "ProductUIReportGroup" ADD CONSTRAINT "ProductUIReportGroup_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductUIReportGroup" ADD CONSTRAINT "ProductUIReportGroup_reviewWorkflowId_fkey"
    FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DevelopmentWorkflow" ADD COLUMN "productUIReportGroupId" TEXT;
CREATE UNIQUE INDEX "DevelopmentWorkflow_productUIReportGroupId_key" ON "DevelopmentWorkflow"("productUIReportGroupId");
ALTER TABLE "DevelopmentWorkflow" ADD CONSTRAINT "DevelopmentWorkflow_productUIReportGroupId_fkey"
    FOREIGN KEY ("productUIReportGroupId") REFERENCES "ProductUIReportGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
