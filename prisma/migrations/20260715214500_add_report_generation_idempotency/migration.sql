-- AlterTable
ALTER TABLE "ReportArtifact" ADD COLUMN "generationKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_userId_generationKey_key" ON "ReportArtifact"("userId", "generationKey");
