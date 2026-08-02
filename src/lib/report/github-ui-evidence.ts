import { GitHubEvidenceSchema, type GitHubEvidence, type ReportSourceReference } from "./contracts";

// 这是可审计的初始参考目录；正式接入 RAG 前仍需冻结 commit SHA 并完成许可证核对。
export const DEFAULT_GITHUB_UI_EVIDENCE: GitHubEvidence[] = GitHubEvidenceSchema.array().parse([
  {
    id: "github-shadcn-ui",
    repositoryUrl: "https://github.com/shadcn-ui/ui",
    repositoryName: "shadcn/ui",
    commitOrTag: "main (待冻结 SHA)",
    path: "README.md / apps/www/registry",
    locator: "组件注册与示例目录",
    license: "MIT (以仓库当前 LICENSE 为准)",
    evidenceType: "component_library",
    insight: "适合作为可组合 React 组件、页面区块和设计 token 落地方式的参考；下游 Agent 应按需求重组，而不是复制整页。",
    applicableWhen: ["需要快速搭建可复用 UI 组件", "需要让页面结构与组件实现保持一致"],
    reusePolicy: "adapt_with_license_review",
  },
  {
    id: "github-radix-primitives",
    repositoryUrl: "https://github.com/radix-ui/primitives",
    repositoryName: "Radix Primitives",
    commitOrTag: "main (待冻结 SHA)",
    path: "packages/react / primitives",
    locator: "对话框、菜单、弹出层和键盘交互原语",
    license: "MIT (以仓库当前 LICENSE 为准)",
    evidenceType: "accessibility_primitive",
    insight: "适合作为焦点管理、键盘操作、ARIA 语义和交互状态设计的参考，尤其适用于审批、弹窗和复杂表单。",
    applicableWhen: ["页面包含弹窗或菜单等复杂交互", "需要明确无障碍和键盘行为"],
    reusePolicy: "adapt_with_license_review",
  },
  {
    id: "github-ant-design",
    repositoryUrl: "https://github.com/ant-design/ant-design",
    repositoryName: "Ant Design",
    commitOrTag: "main (待冻结 SHA)",
    path: "components / docs",
    locator: "表格、表单、反馈和数据密集型页面",
    license: "MIT (以仓库当前 LICENSE 为准)",
    evidenceType: "design_system",
    insight: "适合作为企业后台的信息密度、表格筛选、表单校验和反馈组件组织方式的参考；不直接代表本项目最终视觉风格。",
    applicableWhen: ["产品需要处理结构化数据和复杂表单", "需要企业级后台的信息层级参考"],
    reusePolicy: "reference_only",
  },
]);

export function githubEvidenceAsSource(evidence: GitHubEvidence): ReportSourceReference {
  return {
    sourceType: "github_evidence",
    refId: evidence.id,
    label: `${evidence.repositoryName} · ${evidence.evidenceType}`,
    locator: `${evidence.commitOrTag} · ${evidence.path}${evidence.locator ? ` · ${evidence.locator}` : ""}`,
  };
}

export function parseGitHubEvidence(value: unknown) {
  return GitHubEvidenceSchema.array().parse(value);
}
