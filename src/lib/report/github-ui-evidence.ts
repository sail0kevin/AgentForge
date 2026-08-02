import { GitHubEvidenceSchema, type GitHubEvidence, type ReportSourceReference } from "./contracts";

// 固定 SHA 让 GitHub/UI 参考快照可复现；它不代表代码已获复用许可，也不代表下游网站已经通过验收。
// 仅接受完整且未标记为待冻结的提交 SHA，避免把分支名或短哈希误判为可复现证据。
const GITHUB_COMMIT_SHA_PATTERN = /\b[0-9a-f]{40}\b/i;

export function hasPinnedGitHubCommit(evidence: Pick<GitHubEvidence, "commitOrTag">) {
  return GITHUB_COMMIT_SHA_PATTERN.test(evidence.commitOrTag)
    && !evidence.commitOrTag.includes("待冻结");
}
export const DEFAULT_GITHUB_UI_EVIDENCE: GitHubEvidence[] = GitHubEvidenceSchema.array().parse([
  {
    id: "github-shadcn-ui",
    repositoryUrl: "https://github.com/shadcn-ui/ui",
    repositoryName: "shadcn/ui",
    commitOrTag: "commit cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4 (main snapshot)",
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
    commitOrTag: "commit f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae (main snapshot)",
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
    commitOrTag: "commit bcad5cb12ad98294b05c21cfd4701cf0b8fb37b3 (master snapshot)",
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
