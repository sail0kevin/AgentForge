-- CreateTable
CREATE TABLE "ReviewWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "planningArtifactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "candidatesJson" TEXT NOT NULL,
    "reviewJson" TEXT,
    "evaluationJson" TEXT,
    "failuresJson" TEXT NOT NULL DEFAULT '[]',
    "budgetState" TEXT NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 1,
    "approvalStatus" TEXT NOT NULL DEFAULT 'not_required',
    "approvalDecision" TEXT,
    "approvalNote" TEXT,
    "decidedAt" DATETIME,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewWorkflow_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewWorkflow_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWorkflow_runId_key" ON "ReviewWorkflow"("runId");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_planningArtifactId_createdAt_idx" ON "ReviewWorkflow"("planningArtifactId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_userId_createdAt_idx" ON "ReviewWorkflow"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_approvalStatus_createdAt_idx" ON "ReviewWorkflow"("approvalStatus", "createdAt");
