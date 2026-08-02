-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ToolInvocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "errorCode" TEXT,
    "replayed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    CONSTRAINT "ToolInvocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ToolInvocation" ("durationMs", "errorCode", "finishedAt", "id", "inputJson", "outputJson", "runId", "startedAt", "status", "toolId", "userId") SELECT "durationMs", "errorCode", "finishedAt", "id", "inputJson", "outputJson", "runId", "startedAt", "status", "toolId", "userId" FROM "ToolInvocation";
DROP TABLE "ToolInvocation";
ALTER TABLE "new_ToolInvocation" RENAME TO "ToolInvocation";
CREATE INDEX "ToolInvocation_runId_startedAt_idx" ON "ToolInvocation"("runId", "startedAt");
CREATE INDEX "ToolInvocation_userId_startedAt_idx" ON "ToolInvocation"("userId", "startedAt");
CREATE INDEX "ToolInvocation_toolId_startedAt_idx" ON "ToolInvocation"("toolId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
