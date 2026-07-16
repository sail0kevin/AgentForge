import { z } from "zod";

export const ProjectTypeSchema = z.enum(["website", "admin", "learning", "ecommerce", "dashboard", "api", "other"]);
export const AgentRoleSchema = z.enum(["requirements", "architecture", "frontend", "backend", "data", "testing", "security", "reporter"]);

export const MissingInformationSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().min(5).max(300),
  reason: z.string().min(5).max(500),
  required: z.boolean(),
});

export const RequirementRiskSchema = z.object({
  id: z.string().min(1).max(80),
  description: z.string().min(5).max(500),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string().min(3).max(500),
});

export const RequirementAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  projectType: ProjectTypeSchema,
  summary: z.string().min(10).max(1_000),
  goals: z.array(z.string().min(3).max(300)).min(1).max(10),
  targetUsers: z.array(z.string().min(2).max(200)).min(1).max(10),
  inScope: z.array(z.string().min(2).max(300)).min(1).max(30),
  outOfScope: z.array(z.string().min(2).max(300)).max(30),
  constraints: z.array(z.string().min(2).max(300)).max(20),
  assumptions: z.array(z.string().min(2).max(300)).max(20),
  missingInformation: z.array(MissingInformationSchema).max(10),
  risks: z.array(RequirementRiskSchema).max(20),
  complexity: z.enum(["low", "medium", "high"]),
});

export const ReportSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(2).max(120),
  purpose: z.string().min(5).max(500),
  order: z.number().int().positive(),
  required: z.boolean(),
  sourceTaskIds: z.array(z.string().min(1)).min(1).max(20),
});

export const PlanTaskSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(2).max(160),
  description: z.string().min(10).max(1_000),
  agentRole: AgentRoleSchema,
  dependsOn: z.array(z.string().min(1)).max(20),
  toolIds: z.array(z.string().min(1)).max(10),
  estimatedTokens: z.number().int().positive().max(100_000),
  reportSectionIds: z.array(z.string().min(1)).min(1).max(20),
});

export const ExecutionPlanSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(5).max(200),
  rationale: z.string().min(10).max(2_000),
  tasks: z.array(PlanTaskSchema).min(1).max(30),
  reportSections: z.array(ReportSectionSchema).min(3).max(20),
  evaluationDimensions: z.array(z.string().min(2).max(120)).min(2).max(12),
  maxRounds: z.number().int().min(1).max(5),
  estimatedTotalTokens: z.number().int().positive(),
  estimatedCostUsd: z.number().nonnegative().max(10_000),
});

export const BudgetStateSchema = z.object({
  maxTokens: z.number().int().min(1_000).max(2_000_000),
  maxCostUsd: z.number().positive().max(10_000),
  maxRounds: z.number().int().min(1).max(5),
  maxTasks: z.number().int().min(1).max(30),
});

export const ClarificationRequestSchema = z.object({
  schemaVersion: z.literal(1),
  reason: z.string().min(5).max(1_000),
  questions: z.array(MissingInformationSchema).min(1).max(10),
});

export type RequirementAnalysis = z.infer<typeof RequirementAnalysisSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type BudgetState = z.infer<typeof BudgetStateSchema>;
export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;
