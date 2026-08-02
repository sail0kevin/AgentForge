-- 将产品/UI报告组挂到主工作流，保留传统 ReportArtifact 作为兼容产物。
ALTER TABLE "DevelopmentWorkflow" ADD COLUMN "productUIReportGroupId" TEXT;

CREATE UNIQUE INDEX "DevelopmentWorkflow_productUIReportGroupId_key" ON "DevelopmentWorkflow"("productUIReportGroupId");
