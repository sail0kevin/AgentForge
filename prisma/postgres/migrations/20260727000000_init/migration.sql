-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "globalBudget" DOUBLE PRECISION NOT NULL DEFAULT 50.00,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "keyLength" INTEGER NOT NULL DEFAULT 0,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'AI',
    "color" TEXT NOT NULL DEFAULT '#38bdf8',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.70,
    "maxTokens" INTEGER NOT NULL DEFAULT 1200,
    "apiUrl" TEXT NOT NULL DEFAULT '',
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCredential" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "keyLength" INTEGER NOT NULL DEFAULT 0,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "budgetLimit" DOUBLE PRECISION NOT NULL DEFAULT 10.00,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "activeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningArtifact" (
    "id" TEXT NOT NULL,
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
    "workflowNodeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "input" TEXT NOT NULL,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewWorkflow" (
    "id" TEXT NOT NULL,
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
    "decidedAt" TIMESTAMP(3),
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "workflowNodeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "planningArtifactId" TEXT NOT NULL,
    "reviewWorkflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentReportId" TEXT,
    "generationKey" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "sourceManifestJson" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentWorkflow" (
    "id" TEXT NOT NULL,
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
    "leaseExpiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowNode" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "artifactType" TEXT,
    "artifactId" TEXT,
    "summary" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceAgent" (
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkspaceAgent_pkey" PRIMARY KEY ("workspaceId","agentId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agentId" TEXT,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'local-upload',
    "sourceUrl" TEXT,
    "sourceVersion" TEXT NOT NULL DEFAULT '1',
    "license" TEXT NOT NULL DEFAULT 'unspecified',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "errorCode" TEXT,
    "replayed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunkEmbedding" (
    "chunkId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "vectorJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunkEmbedding_pkey" PRIMARY KEY ("chunkId")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "costCny" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_provider_key" ON "ApiKey"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCredential_agentId_key" ON "AgentCredential"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningArtifact_runId_key" ON "PlanningArtifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningArtifact_workflowNodeKey_key" ON "PlanningArtifact"("workflowNodeKey");

-- CreateIndex
CREATE INDEX "PlanningArtifact_userId_createdAt_idx" ON "PlanningArtifact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanningArtifact_plannerAgentId_idx" ON "PlanningArtifact"("plannerAgentId");

-- CreateIndex
CREATE INDEX "Run_workspaceId_startedAt_idx" ON "Run"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "Run_userId_startedAt_idx" ON "Run"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWorkflow_runId_key" ON "ReviewWorkflow"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewWorkflow_workflowNodeKey_key" ON "ReviewWorkflow"("workflowNodeKey");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_planningArtifactId_createdAt_idx" ON "ReviewWorkflow"("planningArtifactId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_userId_createdAt_idx" ON "ReviewWorkflow"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewWorkflow_approvalStatus_createdAt_idx" ON "ReviewWorkflow"("approvalStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_runId_key" ON "ReportArtifact"("runId");

-- CreateIndex
CREATE INDEX "ReportArtifact_planningArtifactId_createdAt_idx" ON "ReportArtifact"("planningArtifactId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportArtifact_userId_createdAt_idx" ON "ReportArtifact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportArtifact_parentReportId_idx" ON "ReportArtifact"("parentReportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_reviewWorkflowId_version_key" ON "ReportArtifact"("reviewWorkflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReportArtifact_userId_generationKey_key" ON "ReportArtifact"("userId", "generationKey");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentWorkflow_threadId_key" ON "DevelopmentWorkflow"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentWorkflow_planningArtifactId_key" ON "DevelopmentWorkflow"("planningArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentWorkflow_reviewWorkflowId_key" ON "DevelopmentWorkflow"("reviewWorkflowId");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentWorkflow_reportArtifactId_key" ON "DevelopmentWorkflow"("reportArtifactId");

-- CreateIndex
CREATE INDEX "DevelopmentWorkflow_userId_createdAt_idx" ON "DevelopmentWorkflow"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DevelopmentWorkflow_status_updatedAt_idx" ON "DevelopmentWorkflow"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkflowNode_workflowId_sortOrder_idx" ON "WorkflowNode"("workflowId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowNode_workflowId_nodeKey_key" ON "WorkflowNode"("workflowId", "nodeKey");

-- CreateIndex
CREATE INDEX "Message_workspaceId_createdAt_idx" ON "Message"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_runId_createdAt_idx" ON "Message"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "ToolInvocation_runId_startedAt_idx" ON "ToolInvocation"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "ToolInvocation_userId_startedAt_idx" ON "ToolInvocation"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ToolInvocation_toolId_startedAt_idx" ON "ToolInvocation"("toolId", "startedAt");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "DocumentChunkEmbedding_model_idx" ON "DocumentChunkEmbedding"("model");

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsage_messageId_key" ON "TokenUsage"("messageId");

-- CreateIndex
CREATE INDEX "TokenUsage_workspaceId_createdAt_idx" ON "TokenUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_runId_createdAt_idx" ON "TokenUsage"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCredential" ADD CONSTRAINT "AgentCredential_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningArtifact" ADD CONSTRAINT "PlanningArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningArtifact" ADD CONSTRAINT "PlanningArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningArtifact" ADD CONSTRAINT "PlanningArtifact_plannerAgentId_fkey" FOREIGN KEY ("plannerAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkflow" ADD CONSTRAINT "ReviewWorkflow_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkflow" ADD CONSTRAINT "ReviewWorkflow_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewWorkflow" ADD CONSTRAINT "ReviewWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "ReportArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentWorkflow" ADD CONSTRAINT "DevelopmentWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentWorkflow" ADD CONSTRAINT "DevelopmentWorkflow_planningArtifactId_fkey" FOREIGN KEY ("planningArtifactId") REFERENCES "PlanningArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentWorkflow" ADD CONSTRAINT "DevelopmentWorkflow_reviewWorkflowId_fkey" FOREIGN KEY ("reviewWorkflowId") REFERENCES "ReviewWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentWorkflow" ADD CONSTRAINT "DevelopmentWorkflow_reportArtifactId_fkey" FOREIGN KEY ("reportArtifactId") REFERENCES "ReportArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNode" ADD CONSTRAINT "WorkflowNode_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "DevelopmentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgent" ADD CONSTRAINT "WorkspaceAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunkEmbedding" ADD CONSTRAINT "DocumentChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
