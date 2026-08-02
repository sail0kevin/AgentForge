CREATE TABLE "ProductUIReportGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewWorkflowId" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "reportsJson" TEXT NOT NULL,
    "comparisonJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "feedbackJson" TEXT NOT NULL DEFAULT '[]',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductUIReportGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductUIReportGroup_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductUIReportGroup_userId_groupId_key" ON "ProductUIReportGroup"("userId", "groupId");
CREATE INDEX "ProductUIReportGroup_userId_createdAt_idx" ON "ProductUIReportGroup"("userId", "createdAt");
CREATE INDEX "ProductUIReportGroup_reviewWorkflowId_createdAt_idx" ON "ProductUIReportGroup"("reviewWorkflowId", "createdAt");
