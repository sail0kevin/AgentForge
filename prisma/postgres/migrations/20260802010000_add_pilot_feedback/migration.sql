CREATE TABLE "PilotFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "reportUsability" TEXT NOT NULL,
    "humanEdited" BOOLEAN NOT NULL DEFAULT false,
    "interventionReason" TEXT,
    "evidenceIssueType" TEXT,
    "failureCategory" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PilotFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotFeedback_workflowId_key" ON "PilotFeedback"("workflowId");
CREATE INDEX "PilotFeedback_userId_createdAt_idx" ON "PilotFeedback"("userId", "createdAt");
CREATE INDEX "PilotFeedback_reportUsability_createdAt_idx" ON "PilotFeedback"("reportUsability", "createdAt");

ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "DevelopmentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
