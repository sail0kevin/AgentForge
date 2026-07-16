-- Add idempotency keys used by restartable workflow nodes.
ALTER TABLE "PlanningArtifact" ADD COLUMN "workflowNodeKey" TEXT;
ALTER TABLE "ReviewWorkflow" ADD COLUMN "workflowNodeKey" TEXT;

CREATE UNIQUE INDEX "PlanningArtifact_workflowNodeKey_key" ON "PlanningArtifact"("workflowNodeKey");
CREATE UNIQUE INDEX "ReviewWorkflow_workflowNodeKey_key" ON "ReviewWorkflow"("workflowNodeKey");

-- Product-facing workflow record. Full LangGraph checkpoint payloads live in
-- the dedicated checkpointer database and are never returned by the API.
CREATE TABLE "DevelopmentWorkflow" (
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
    "checkpointId" TEXT,
    "checkpointNamespace" TEXT NOT NULL DEFAULT '',
    "interruptJson" TEXT,
    "lastResumeJson" TEXT,
    "lastErrorCode" TEXT,
    "leaseExpiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DevelopmentWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DevelopmentWorkflow_reportArtifactId_fkey" FOREIGN KEY ("reportArtifactId") REFERENCES "ReportArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkflowNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "artifactType" TEXT,
    "artifactId" TEXT,
    "summary" TEXT,
    "errorCode" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowNode_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "DevelopmentWorkflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DevelopmentWorkflow_threadId_key" ON "DevelopmentWorkflow"("threadId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_planningArtifactId_key" ON "DevelopmentWorkflow"("planningArtifactId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_reviewWorkflowId_key" ON "DevelopmentWorkflow"("reviewWorkflowId");
CREATE UNIQUE INDEX "DevelopmentWorkflow_reportArtifactId_key" ON "DevelopmentWorkflow"("reportArtifactId");
CREATE INDEX "DevelopmentWorkflow_userId_createdAt_idx" ON "DevelopmentWorkflow"("userId", "createdAt");
CREATE INDEX "DevelopmentWorkflow_status_updatedAt_idx" ON "DevelopmentWorkflow"("status", "updatedAt");
CREATE UNIQUE INDEX "WorkflowNode_workflowId_nodeKey_key" ON "WorkflowNode"("workflowId", "nodeKey");
CREATE INDEX "WorkflowNode_workflowId_sortOrder_idx" ON "WorkflowNode"("workflowId", "sortOrder");
