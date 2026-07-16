-- CreateTable
CREATE TABLE "PlanningArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plannerAgentId" TEXT,
    "status" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "requirementAnalysis" TEXT,
    "executionPlan" TEXT,
    "reportOutline" TEXT,
    "clarification" TEXT,
    "failureCode" TEXT,
    "budgetState" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanningArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanningArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanningArtifact_plannerAgentId_fkey" FOREIGN KEY ("plannerAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningArtifact_runId_key" ON "PlanningArtifact"("runId");

-- CreateIndex
CREATE INDEX "PlanningArtifact_userId_createdAt_idx" ON "PlanningArtifact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanningArtifact_plannerAgentId_idx" ON "PlanningArtifact"("plannerAgentId");
