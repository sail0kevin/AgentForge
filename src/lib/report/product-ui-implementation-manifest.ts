import { getProductUIAcceptanceProgress } from "./product-ui-acceptance";
import type {
  DevelopmentReport,
  ProductUIReportFeedback,
  ProductUIReportGroup,
  ProductUISpec,
} from "./contracts";

export const PRODUCT_UI_IMPLEMENTATION_MANIFEST_VERSION = 1 as const;

export type ProductUIImplementationManifest = {
  schemaVersion: typeof PRODUCT_UI_IMPLEMENTATION_MANIFEST_VERSION;
  manifestType: "agentforge_product_ui_implementation";
  generatedAt: string;
  provenance: {
    reportGroupId: string;
    reportGroupKey: string;
    reviewWorkflowId: string;
    solutionId: string;
    reportTitle: string;
    evidenceStatus: ProductUISpec["evidenceStatus"];
    evidenceAuditStatus: ProductUISpec["evidenceAuditStatus"];
    // 让下游实现方能按证据影响范围执行，而不是仅从自然语言中猜测设计取舍。
    designDecisions: NonNullable<ProductUISpec["designDecisions"]>;
    traceability: ProductUISpec["traceability"];
  };
  product: {
    name: string;
    positioning: string;
    targetUsers: string[];
    primaryScenarios: string[];
  };
  visualDirection: ProductUISpec["designDirection"];
  routes: Array<{
    id: string;
    route: string;
    name: string;
    purpose: string;
    primaryAction: string;
    blueprint: ProductUISpec["pages"][number]["blueprint"];
    implementationInstructions: string[];
    components: string[];
    requiredStates: string[];
    acceptanceCriteria: string[];
    acceptanceIds: string[];
  }>;
  implementation: {
    order: string[];
    contentRequirements: string[];
    constraints: string[];
    responsiveRules: string[];
    interactionStates: string[];
    included: string[];
    excluded: string[];
  };
  acceptance: {
    matrix: NonNullable<ProductUISpec["acceptanceMatrix"]>;
    runtime: {
      status: "pending" | "pass" | "needs_revision";
      checkedAt: string | null;
      feedbackNote: string | null;
      requiredAcceptanceIds: string[];
      passedAcceptanceIds: string[];
      failedAcceptanceIds: string[];
      notVerifiedAcceptanceIds: string[];
      missingAcceptanceIds: string[];
      hasCompleteAcceptanceEvidence: boolean;
      runtimeEvidence: ProductUIReportFeedback["runtimeEvidence"];
    };
  };
  evidence: ProductUISpec["evidence"];
  statusDeclaration: {
    implemented: string[];
    targetDesign: string[];
  };
};

type ProductUIManifestGroup = ProductUIReportGroup & {
  id?: string;
  reviewWorkflowId?: string;
};

type ProductUIImplementationRuntimeAcceptance = ProductUIImplementationManifest["acceptance"]["runtime"];

function latestFeedback(feedback: ProductUIReportFeedback[], solutionId: string) {
  return [...feedback].reverse().find((item) => item.solutionId === solutionId) ?? null;
}

function buildRuntimeStatus(
  feedback: ProductUIReportFeedback | null,
  spec: ProductUISpec,
): ProductUIImplementationRuntimeAcceptance {
  const requiredAcceptanceIds = spec.acceptanceMatrix?.map((item) => item.id) ?? [];
  const progress = getProductUIAcceptanceProgress(feedback?.runtimeEvidence ?? null, requiredAcceptanceIds);
  const status = feedback?.outcome === "needs_revision" || progress.failedAcceptanceIds.length > 0
    ? "needs_revision"
    : feedback?.outcome === "pass" && feedback.runtimeEvidence && progress.hasCompleteAcceptanceEvidence
      ? "pass"
      : "pending";

  return {
    status,
    checkedAt: feedback?.checkedAt ?? null,
    feedbackNote: feedback?.note ?? null,
    ...progress,
    runtimeEvidence: feedback?.runtimeEvidence ?? null,
  };
}

/**
 * 将完整 Product/UI 报告压缩为单方案实施清单。
 * 清单描述可执行目标和真实验收状态，不生成或声称已经生成网站源码。
 */
export function buildProductUIImplementationManifest(
  group: ProductUIManifestGroup,
  report: DevelopmentReport,
  metadata: { generatedAt?: string } = {},
): ProductUIImplementationManifest {
  const spec = report.productUISpec;
  if (!spec) throw new Error("PRODUCT_UI_SPEC_MISSING");

  const acceptanceMatrix = spec.acceptanceMatrix ?? [];
  const feedback = latestFeedback(group.feedback, spec.solutionId);
  const executionContract = spec.aiExecutionContract;

  return {
    schemaVersion: PRODUCT_UI_IMPLEMENTATION_MANIFEST_VERSION,
    manifestType: "agentforge_product_ui_implementation",
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    provenance: {
      reportGroupId: group.id ?? group.groupId,
      reportGroupKey: group.groupId,
      reviewWorkflowId: group.reviewWorkflowId ?? "not_available",
      solutionId: spec.solutionId,
      reportTitle: report.title,
      evidenceStatus: spec.evidenceStatus,
      evidenceAuditStatus: spec.evidenceAuditStatus,
      designDecisions: spec.designDecisions ?? [],
      traceability: spec.traceability,
    },
    product: {
      name: spec.productName,
      positioning: spec.productPositioning,
      targetUsers: spec.targetUsers,
      primaryScenarios: spec.primaryScenarios,
    },
    visualDirection: spec.designDirection,
    routes: spec.pages.map((page) => ({
      id: page.id,
      route: page.route,
      name: page.name,
      purpose: page.purpose,
      primaryAction: page.primaryAction,
      blueprint: page.blueprint,
      implementationInstructions: page.implementationInstructions ?? [],
      components: page.components,
      requiredStates: page.requiredStates,
      acceptanceCriteria: page.acceptanceCriteria,
      acceptanceIds: acceptanceMatrix
        .filter((item) => item.targetType === "page" && item.targetId === page.id)
        .map((item) => item.id),
    })),
    implementation: {
      order: executionContract?.implementationOrder ?? [
        "依据页面蓝图建立路由、布局和首屏内容。",
        "实现主要操作、交互状态、响应式规则和无障碍要求。",
        "运行网站并按验收矩阵回传真实运行证据。",
      ],
      contentRequirements: executionContract?.contentRequirements ?? [],
      constraints: spec.implementationConstraints,
      responsiveRules: spec.responsiveRules,
      interactionStates: spec.interactionStates,
      included: spec.deliveryBoundary.included,
      excluded: spec.deliveryBoundary.excluded,
    },
    acceptance: {
      matrix: acceptanceMatrix,
      runtime: buildRuntimeStatus(feedback, spec),
    },
    evidence: spec.evidence,
    statusDeclaration: {
      implemented: [
        "AgentForge 已生成并持久化本方案的结构化 Product/UI 报告、来源映射和验收矩阵。",
        "本实施清单可被下游 AI 编程工具或自动化流水线读取，用于创建和核验网站实现。",
      ],
      targetDesign: [
        "页面源码、预览地址、截图和最终视觉效果必须由下游实现后通过真实运行证据确认。",
        "固定 SHA 仅保证引用快照可复现；来源审计状态以 evidenceAuditStatus 为准。",
      ],
    },
  };
}

export function renderProductUIImplementationManifestJson(
  group: ProductUIManifestGroup,
  report: DevelopmentReport,
  metadata: { generatedAt?: string } = {},
) {
  return JSON.stringify(buildProductUIImplementationManifest(group, report, metadata), null, 2);
}