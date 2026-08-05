-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DevelopmentWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentNode" TEXT NOT NULL DEFAULT 'analyze_requirement',
    "requirement" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'baseline',
    "agentConfigJson" TEXT NOT NULL DEFAULT '{}',
    "planningArtifactId" TEXT,
    "reviewWorkflowId" TEXT,
    "reportArtifactId" TEXT,
    "productUIReportGroupId" TEXT,
    "checkpointId" TEXT,
    "checkpointNamespace" TEXT NOT NULL DEFAULT '',
    "interruptJson" TEXT,
    "lastResumeJson" TEXT,
    "lastErrorCode" TEXT,
    "leaseExpiresAt" DATETIME,
    "leaseOwnerId" TEXT,
    "leaseToken" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DevelopmentWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_reportArtifactId_fkey" FOREIGN KEY ("reportArtifactId") REFERENCES "ReportArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_productUIReportGroupId_fkey" FOREIGN KEY ("productUIReportGroupId") REFERENCES "ProductUIReportGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DevelopmentWorkflow" ("agentConfigJson", "checkpointId", "checkpointNamespace", "createdAt", "currentNode", "finishedAt", "id", "interruptJson", "lastErrorCode", "lastResumeJson", "leaseExpiresAt", "leaseOwnerId", "leaseToken", "mode", "planningArtifactId", "productUIReportGroupId", "reportArtifactId", "requirement", "reviewWorkflowId", "schemaVersion", "startedAt", "status", "threadId", "updatedAt", "userId", "version") SELECT "agentConfigJson", "checkpointId", "checkpointNamespace", "createdAt", "currentNode", "finishedAt", "id", "interruptJson", "lastErrorCode", "lastResumeJson", "leaseExpiresAt", "leaseOwnerId", "leaseToken", "mode", "planningArtifactId", "productUIReportGroupId", "reportArtifactId", "requirement", "reviewWorkflowId", "schemaVersion", "startedAt", "status", "threadId", "updatedAt", "userId", "version" FROM "DevelopmentWorkflow";
DROP TABLE "DevelopmentWorkflow";
ALTER TABLE "new_DevelopmentWorkflow" RENAME TO "DevelopmentWorkflow";
CREATE UNIQUE INDEX "DevelopmentWorkflow_threadId_key" ON "DevelopmentWorkflow"("threadId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_planningArtifactId_key" ON "DevelopmentWorkflow"("planningArtifactId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_reviewWorkflowId_key" ON "DevelopmentWorkflow"("reviewWorkflowId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_reportArtifactId_key" ON "DevelopmentWorkflow"("reportArtifactId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_productUIReportGroupId_key" ON "DevelopmentWorkflow"("productUIReportGroupId");
CREATE INDEX "DevelopmentWorkflow_userId_createdAt_idx" ON "DevelopmentWorkflow"("userId", "createdAt");
CREATE INDEX "DevelopmentWorkflow_status_updatedAt_idx" ON "DevelopmentWorkflow"("status", "updatedAt");
CREATE INDEX "DevelopmentWorkflow_leaseExpiresAt_idx" ON "DevelopmentWorkflow"("leaseExpiresAt");
CREATE TABLE "new_TokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "tokenSource" TEXT NOT NULL DEFAULT 'estimated',
    "costUsd" REAL NOT NULL,
    "costCny" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TokenUsage" ("agentId", "costCny", "costUsd", "createdAt", "id", "inputTokens", "messageId", "model", "outputTokens", "provider", "runId", "workspaceId") SELECT "agentId", "costCny", "costUsd", "createdAt", "id", "inputTokens", "messageId", "model", "outputTokens", "provider", "runId", "workspaceId" FROM "TokenUsage";
DROP TABLE "TokenUsage";
ALTER TABLE "new_TokenUsage" RENAME TO "TokenUsage";
CREATE UNIQUE INDEX "TokenUsage_messageId_key" ON "TokenUsage"("messageId");
CREATE INDEX "TokenUsage_workspaceId_createdAt_idx" ON "TokenUsage"("workspaceId", "createdAt");
CREATE INDEX "TokenUsage_runId_createdAt_idx" ON "TokenUsage"("runId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
