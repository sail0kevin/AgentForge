-- AlterTable
ALTER TABLE "Document" ADD COLUMN "checksumSha256" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Document" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'local-upload';
ALTER TABLE "Document" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Document" ADD COLUMN "sourceVersion" TEXT NOT NULL DEFAULT '1';
ALTER TABLE "Document" ADD COLUMN "license" TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE "Document" ADD COLUMN "reviewedAt" DATETIME;

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "errorCode" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    CONSTRAINT "ToolInvocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ToolInvocation_runId_startedAt_idx" ON "ToolInvocation"("runId", "startedAt");
CREATE INDEX "ToolInvocation_userId_startedAt_idx" ON "ToolInvocation"("userId", "startedAt");
CREATE INDEX "ToolInvocation_toolId_startedAt_idx" ON "ToolInvocation"("toolId", "startedAt");
