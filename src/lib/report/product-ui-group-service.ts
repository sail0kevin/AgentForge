import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  ProductUIReportFeedbackSchema,
  ProductUIReportGroupSchema,
  ProductUIRuntimeEvidenceSchema,
  type ProductUIReportFeedback,
  type ProductUIReportGroup,
  type ProductUIRuntimeEvidence,
} from "./contracts";

export type ProductUIReportGroupFeedback = ProductUIReportFeedback;

// 反馈状态只反映已经记录的真实验收结果，不把目标设计误写成网站已通过。
export function deriveProductUIReportGroupStatus(
  feedback: ProductUIReportGroupFeedback[],
  solutionIds: string[],
): "generated" | "in_review" | "accepted" | "needs_revision" {
  if (feedback.some((item) => item.outcome === "needs_revision")) return "needs_revision";
  // 只有每套方案均包含结构化运行证据且通过，才能标记为已验收。
  if (solutionIds.length > 0 && solutionIds.every((solutionId) => feedback.some((item) => (
    item.solutionId === solutionId
    && item.outcome === "pass"
    && item.runtimeEvidence
  )))) return "accepted";
  return feedback.length > 0 ? "in_review" : "generated";
}

export function mapProductUIReportGroup(record: {
  id: string;
  groupId: string;
  userId: string;
  reviewWorkflowId: string;
  requirement: string;
  reportsJson: string;
  comparisonJson: string;
  status: string;
  feedbackJson: string;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const group = ProductUIReportGroupSchema.parse({
    schemaVersion: record.schemaVersion,
    groupId: record.groupId,
    requirement: record.requirement,
    reports: JSON.parse(record.reportsJson),
    comparison: JSON.parse(record.comparisonJson),
    status: record.status,
    feedback: JSON.parse(record.feedbackJson),
  });
  return {
    id: record.id,
    userId: record.userId,
    reviewWorkflowId: record.reviewWorkflowId,
    ...group,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function saveProductUIReportGroup(input: {
  userId: string;
  reviewWorkflowId: string;
  group: ProductUIReportGroup;
}) {
  const group = ProductUIReportGroupSchema.parse(input.group);
  const existing = await prisma.productUIReportGroup.findUnique({
    where: { userId_groupId: { userId: input.userId, groupId: group.groupId } },
  });
  if (existing) return { record: mapProductUIReportGroup(existing), replayed: true };

  const review = await prisma.reviewWorkflow.findFirst({ where: { id: input.reviewWorkflowId, userId: input.userId }, select: { id: true } });
  if (!review) throw new Error("REVIEW_NOT_FOUND");
  try {
    const created = await prisma.productUIReportGroup.create({
      data: {
        groupId: group.groupId,
        userId: input.userId,
        reviewWorkflowId: input.reviewWorkflowId,
        requirement: group.requirement,
        reportsJson: JSON.stringify(group.reports),
        comparisonJson: JSON.stringify(group.comparison),
        status: group.status,
        feedbackJson: JSON.stringify(group.feedback),
        schemaVersion: group.schemaVersion,
      },
    });
    return { record: mapProductUIReportGroup(created), replayed: false };
  } catch (error) {
    // 并发重试可能同时创建同一个 groupId；唯一约束命中时返回已存在记录，保持请求幂等。
    if ((error as { code?: string }).code !== "P2002") throw error;
    const replayed = await prisma.productUIReportGroup.findUnique({
      where: { userId_groupId: { userId: input.userId, groupId: group.groupId } },
    });
    if (!replayed) throw error;
    return { record: mapProductUIReportGroup(replayed), replayed: true };
  }
}

export async function updateProductUIReportFeedback(input: {
  id: string;
  userId: string;
  solutionId: string;
  outcome: "pass" | "needs_revision";
  note: string;
  runtimeEvidence: ProductUIRuntimeEvidence;
}) {
  const existing = await prisma.productUIReportGroup.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!existing) throw new Error("PRODUCT_UI_GROUP_NOT_FOUND");
  const feedback = z.array(ProductUIReportFeedbackSchema).parse(JSON.parse(existing.feedbackJson));
  const runtimeEvidence = ProductUIRuntimeEvidenceSchema.parse(input.runtimeEvidence);
  const group = ProductUIReportGroupSchema.parse({
    schemaVersion: existing.schemaVersion,
    groupId: existing.groupId,
    requirement: existing.requirement,
    reports: JSON.parse(existing.reportsJson),
    comparison: JSON.parse(existing.comparisonJson),
    status: existing.status,
    feedback,
  });
  const solutionIds = group.reports.map((report) => report.productUISpec?.solutionId).filter((solutionId): solutionId is string => Boolean(solutionId));
  if (!solutionIds.includes(input.solutionId)) throw new Error("PRODUCT_UI_SOLUTION_NOT_FOUND");
  const nextFeedback = [...feedback.filter((item) => item.solutionId !== input.solutionId), {
    solutionId: input.solutionId,
    outcome: input.outcome,
    note: input.note,
    runtimeEvidence,
    checkedAt: new Date().toISOString(),
  }];
  const nextStatus = deriveProductUIReportGroupStatus(nextFeedback, solutionIds);
  const updated = await prisma.productUIReportGroup.update({
    where: { id: existing.id },
    data: { feedbackJson: JSON.stringify(nextFeedback), status: nextStatus },
  });
  return mapProductUIReportGroup(updated);
}