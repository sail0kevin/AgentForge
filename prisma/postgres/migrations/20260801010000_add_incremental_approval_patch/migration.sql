ALTER TABLE "ReviewWorkflow" ADD COLUMN "approvalTaskPatchJson" TEXT;
ALTER TABLE "ReviewWorkflow" ADD COLUMN "approvalOriginalPlanSha256" TEXT;
ALTER TABLE "ReviewWorkflow" ADD COLUMN "approvalAmendedPlanSha256" TEXT;
