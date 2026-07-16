-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "activeRunId" TEXT;

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "input" TEXT NOT NULL,
    "totalSpent" REAL NOT NULL DEFAULT 0.00,
    "errorCode" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "Run_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "runId" TEXT REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TokenUsage" ADD COLUMN "runId" TEXT REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Run_workspaceId_startedAt_idx" ON "Run"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "Run_userId_startedAt_idx" ON "Run"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Message_runId_createdAt_idx" ON "Message"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_runId_createdAt_idx" ON "TokenUsage"("runId", "createdAt");
