import {
  PilotEvidenceIssueTypeSchema,
  PilotFailureCategorySchema,
  PilotInterventionReasonSchema,
  PilotReportUsabilitySchema,
} from "./feedback";

export const PILOT_FEEDBACK_MINIMUM_SAMPLE_SIZE = 20;

export type PilotFeedbackSummaryRecord = {
  reportUsability: string;
  humanEdited: boolean;
  interventionReason: string | null;
  evidenceIssueType: string | null;
  failureCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SummaryDistribution = Record<string, number>;

export type PilotFeedbackSummary = {
  sampleSize: number;
  observationWindow: {
    firstFeedbackAt: string | null;
    lastFeedbackAt: string | null;
  };
  reportUsability: SummaryDistribution;
  interventionReason: SummaryDistribution;
  evidenceIssueType: SummaryDistribution;
  failureCategory: SummaryDistribution;
  rates: {
    usableReportRate: number | null;
    usableWithoutEditsRate: number | null;
    humanEditedRate: number | null;
    notUsableRate: number | null;
  };
  dataQuality: {
    invalidPersistedValueCount: number;
  };
  conclusionReadiness: {
    status: "not_ready" | "descriptive_only";
    minimumSampleSize: number;
    message: string;
  };
};

type EnumSchema = {
  safeParse(value: unknown): { success: boolean };
};

function countValue(distribution: SummaryDistribution, value: string) {
  distribution[value] = (distribution[value] ?? 0) + 1;
}

/**
 * 数据库字段理论上只能来自受控枚举；汇总时仍收敛异常值，避免把意外原文带入导出。
 */
function normalizeEnumValue(value: string | null, schema: EnumSchema, dataQuality: { invalidPersistedValueCount: number }) {
  if (!value) return "not_provided";
  if (schema.safeParse(value).success) return value;
  dataQuality.invalidPersistedValueCount += 1;
  return "invalid_persisted_value";
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function observationWindow(records: PilotFeedbackSummaryRecord[]) {
  if (records.length === 0) {
    return { firstFeedbackAt: null, lastFeedbackAt: null };
  }

  const createdAtValues = records.map((record) => record.createdAt.getTime());
  const updatedAtValues = records.map((record) => record.updatedAt.getTime());
  return {
    firstFeedbackAt: new Date(Math.min(...createdAtValues)).toISOString(),
    lastFeedbackAt: new Date(Math.max(...updatedAtValues)).toISOString(),
  };
}

/**
 * 生成试点反馈的匿名描述性统计。样本量不足时保留原始计数，但明确禁止据此推导用户价值结论。
 */
export function summarizePilotFeedback(
  records: PilotFeedbackSummaryRecord[],
  minimumSampleSize = PILOT_FEEDBACK_MINIMUM_SAMPLE_SIZE,
): PilotFeedbackSummary {
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 1) {
    throw new Error("PILOT_FEEDBACK_MINIMUM_SAMPLE_SIZE_INVALID");
  }

  const reportUsability: SummaryDistribution = {};
  const interventionReason: SummaryDistribution = {};
  const evidenceIssueType: SummaryDistribution = {};
  const failureCategory: SummaryDistribution = {};
  const dataQuality = { invalidPersistedValueCount: 0 };
  let usableWithoutEdits = 0;
  let usableReports = 0;
  let humanEdited = 0;
  let notUsable = 0;

  for (const record of records) {
    const usability = normalizeEnumValue(record.reportUsability, PilotReportUsabilitySchema, dataQuality);
    countValue(reportUsability, usability);
    countValue(
      interventionReason,
      normalizeEnumValue(record.interventionReason, PilotInterventionReasonSchema, dataQuality),
    );
    countValue(
      evidenceIssueType,
      normalizeEnumValue(record.evidenceIssueType, PilotEvidenceIssueTypeSchema, dataQuality),
    );
    countValue(
      failureCategory,
      normalizeEnumValue(record.failureCategory, PilotFailureCategorySchema, dataQuality),
    );

    if (usability === "usable_without_edits") usableWithoutEdits += 1;
    if (usability === "usable_without_edits" || usability === "usable_with_edits") usableReports += 1;
    if (usability === "not_usable") notUsable += 1;
    if (record.humanEdited) humanEdited += 1;
  }

  const sampleSize = records.length;
  const readyForDescriptiveSummary = sampleSize >= minimumSampleSize;
  return {
    sampleSize,
    observationWindow: observationWindow(records),
    reportUsability,
    interventionReason,
    evidenceIssueType,
    failureCategory,
    rates: {
      usableReportRate: rate(usableReports, sampleSize),
      usableWithoutEditsRate: rate(usableWithoutEdits, sampleSize),
      humanEditedRate: rate(humanEdited, sampleSize),
      notUsableRate: rate(notUsable, sampleSize),
    },
    dataQuality,
    conclusionReadiness: {
      status: readyForDescriptiveSummary ? "descriptive_only" : "not_ready",
      minimumSampleSize,
      message: readyForDescriptiveSummary
        ? "样本量达到描述性汇总阈值；结果仍不是对用户价值、模型质量或因果效果的证明。"
        : `当前仅有 ${sampleSize} 条反馈，少于 ${minimumSampleSize} 条描述性汇总阈值；不得据此作出用户价值结论。`,
    },
  };
}
