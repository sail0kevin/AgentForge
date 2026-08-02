import { z } from "zod";

// 独立定义避免盲评编排与运行计划互相导入，保证两者使用同一组冻结实验臂。
export const BlindEvaluationVariantSchema = z.enum([
  "single_agent",
  "dual_candidate",
  "dual_candidate_rag",
  "cross_review",
  "cross_review_human",
]);

export type BlindEvaluationVariant = z.infer<typeof BlindEvaluationVariantSchema>;
