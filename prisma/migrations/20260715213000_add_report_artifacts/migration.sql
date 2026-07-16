-- CreateTable
CREATE TABLE "ReportArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "planningArtifactId" TEXT NOT NULL,
    "reviewWorkflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentReportId" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "sourceManifestJson" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportArtifact_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportArtifact_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportArtifact_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "ReportArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_runId_key" ON "ReportArtifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_reviewWorkflowId_version_key" ON "ReportArtifact"("reviewWorkflowId", "version");

-- CreateIndex
CREATE INDEX "ReportArtifact_planningArtifactId_createdAt_idx" ON "ReportArtifact"("planningArtifactId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportArtifact_userId_createdAt_idx" ON "ReportArtifact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportArtifact_parentReportId_idx" ON "ReportArtifact"("parentReportId");
