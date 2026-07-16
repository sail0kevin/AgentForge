-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "globalBudget" REAL NOT NULL DEFAULT 50.00,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'AI',
    "color" TEXT NOT NULL DEFAULT '#38bdf8',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.70,
    "maxTokens" INTEGER NOT NULL DEFAULT 1200,
    "apiUrl" TEXT NOT NULL DEFAULT '',
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentCredential_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "budgetLimit" REAL NOT NULL DEFAULT 10.00,
    "totalSpent" REAL NOT NULL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceAgent" (
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("workspaceId", "agentId"),
    CONSTRAINT "WorkspaceAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agentId" TEXT,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" REAL NOT NULL,
    "costCny" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenUsage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_provider_key" ON "ApiKey"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCredential_agentId_key" ON "AgentCredential"("agentId");

-- CreateIndex
CREATE INDEX "Message_workspaceId_createdAt_idx" ON "Message"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsage_messageId_key" ON "TokenUsage"("messageId");

-- CreateIndex
CREATE INDEX "TokenUsage_workspaceId_createdAt_idx" ON "TokenUsage"("workspaceId", "createdAt");
