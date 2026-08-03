import type { ProductUIRuntimeEvidence } from "./contracts";

export type ProductUIAcceptanceProgress = {
  requiredAcceptanceIds: string[];
  passedAcceptanceIds: string[];
  failedAcceptanceIds: string[];
  notVerifiedAcceptanceIds: string[];
  missingAcceptanceIds: string[];
  hasCompleteAcceptanceEvidence: boolean;
};

// 用同一套纯函数计算状态与导出进度，避免“界面显示已验收、报告组却未验收”的口径漂移。
export function getProductUIAcceptanceProgress(
  runtimeEvidence: ProductUIRuntimeEvidence | null | undefined,
  requiredAcceptanceIds: string[] = [],
): ProductUIAcceptanceProgress {
  const required = [...new Set(requiredAcceptanceIds)];
  const resultById = new Map(runtimeEvidence?.acceptanceResults.map((item) => [item.acceptanceId, item]) ?? []);
  const passedAcceptanceIds = required.filter((id) => {
    const result = resultById.get(id);
    return result?.status === "passed" && result.evidencePaths.length > 0;
  });
  const failedAcceptanceIds = required.filter((id) => resultById.get(id)?.status === "failed");
  const notVerifiedAcceptanceIds = required.filter((id) => resultById.get(id)?.status === "not_verified");
  const missingAcceptanceIds = required.filter((id) => !passedAcceptanceIds.includes(id));
  return {
    requiredAcceptanceIds: required,
    passedAcceptanceIds,
    failedAcceptanceIds,
    notVerifiedAcceptanceIds,
    missingAcceptanceIds,
    // 历史规格没有矩阵时，继续使用原有“运行证据 + 通过”语义。
    hasCompleteAcceptanceEvidence: missingAcceptanceIds.length === 0,
  };
}