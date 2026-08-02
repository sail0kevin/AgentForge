import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");

// 日期取文档自身最新的明确更新时间；没有明确日期的历史/设计资料统一以“旧”标识。
const renames = [
  ["docs/2026-08-01 - document-index - 文档索引.md", "docs/2026-08-01 - document-index - 文档索引.md"],
  ["docs/2026-08-01 - opentelemetry-observability-boundary - OpenTelemetry可观测性边界.md", "docs/2026-08-01 - opentelemetry-observability-boundary - OpenTelemetry可观测性边界.md"],
  ["docs/2026-08-01 - v2-workflow-retrieval-data-architecture - V2工作流检索与数据关系.md", "docs/2026-08-01 - v2-workflow-retrieval-data-architecture - V2工作流检索与数据关系.md"],
  ["docs/2026-08-01 - current-runtime-architecture - 当前运行架构.md", "docs/2026-08-01 - current-runtime-architecture - 当前运行架构.md"],
  ["docs/archive - 历史归档资料/2026-07-15 - archive-index - 历史归档说明.md", "docs/archive - 历史归档资料/2026-07-15 - archive-index - 历史归档说明.md"],
  ["docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-3-rag - 旧版RAG整改记录.md", "docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-3-rag - 旧版RAG整改记录.md"],
  ["docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-4-tools - 旧版工具整改记录.md", "docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-4-tools - 旧版工具整改记录.md"],
  ["docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-5-frontend-quality - 旧版前端质量记录.md", "docs/archive - 历史归档资料/remediation-v1 - v1旧版整改记录/2026-07-15 - phase-5-frontend-quality - 旧版前端质量记录.md"],
  ["docs/archive - 历史归档资料/reports - 历史项目报告/2026-07-12 - project-report - 旧版项目报告.md", "docs/archive - 历史归档资料/reports - 历史项目报告/2026-07-12 - project-report - 旧版项目报告.md"],
  ["docs/2026-08-01 - current-development-status - 当前开发状态.md", "docs/2026-08-01 - current-development-status - 当前开发状态.md"],
  ["docs/2026-07-19 - local-demo-guide - 本地演示指南.md", "docs/2026-07-19 - local-demo-guide - 本地演示指南.md"],
  ["docs/design - 产品设计方案/旧 - design-index - 设计文档总入口.md", "docs/design - 产品设计方案/旧 - design-index - 设计文档总入口.md"],
  ["docs/design - 产品设计方案/旧 - langchain-integration-design - LangChain集成设计.md", "docs/design - 产品设计方案/旧 - langchain-integration-design - LangChain集成设计.md"],
  ["docs/design - 产品设计方案/旧 - langgraph-workflow-architecture - LangGraph工作流架构.md", "docs/design - 产品设计方案/旧 - langgraph-workflow-architecture - LangGraph工作流架构.md"],
  ["docs/design - 产品设计方案/旧 - multi-agent-cross-review-workflow - 多智能体交叉评审工作流.md", "docs/design - 产品设计方案/旧 - multi-agent-cross-review-workflow - 多智能体交叉评审工作流.md"],
  ["docs/design - 产品设计方案/2026-07-12 - design-references-and-license - 设计参考与许可说明.md", "docs/design - 产品设计方案/2026-07-12 - design-references-and-license - 设计参考与许可说明.md"],
  ["docs/design - 产品设计方案/旧 - web-ui-ux-knowledge-tool-design - Web界面知识工具设计.md", "docs/design - 产品设计方案/旧 - web-ui-ux-knowledge-tool-design - Web界面知识工具设计.md"],
  ["docs/旧 - hybrid-rag-runtime-boundary - 混合RAG运行边界.md", "docs/旧 - hybrid-rag-runtime-boundary - 混合RAG运行边界.md"],
  ["docs/2026-08-01 - p0-1-ablation-execution-authorization - P0-1消融实验执行授权.md", "docs/2026-08-01 - p0-1-ablation-execution-authorization - P0-1消融实验执行授权.md"],
  ["docs/2026-08-01 - p0-2-postgres-acceptance-status - P0-2PostgreSQL验收状态.md", "docs/2026-08-01 - p0-2-postgres-acceptance-status - P0-2PostgreSQL验收状态.md"],
  ["docs/quality - 质量评测/2026-08-01 - quality-evaluation-index - 质量评测说明.md", "docs/quality - 质量评测/2026-08-01 - quality-evaluation-index - 质量评测说明.md"],
  ["docs/quality - 质量评测/2026-07-19 - blind-evaluation-protocol - 真实模型盲评协议.md", "docs/quality - 质量评测/2026-07-19 - blind-evaluation-protocol - 真实模型盲评协议.md"],
  ["docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md", "docs/remediation - 工程整改实施/2026-07-20 - remediation-index - 整改执行总览.md"],
  ["docs/remediation - 工程整改实施/2026-07-19 - final-report - 工程整改与开发总报告.md", "docs/remediation - 工程整改实施/2026-07-19 - final-report - 工程整改与开发总报告.md"],
  ["docs/remediation - 工程整改实施/2026-07-16 - phase-0-security-and-database - 安全与数据库初始化.md", "docs/remediation - 工程整改实施/2026-07-16 - phase-0-security-and-database - 安全与数据库初始化.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-1-runtime-correctness - 运行正确性与隔离.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-1-runtime-correctness - 运行正确性与隔离.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-2-run-service - 统一运行服务.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-2-run-service - 统一运行服务.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-3-planner-and-structured-output - Planner与结构化输出.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-3-planner-and-structured-output - Planner与结构化输出.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-4-knowledge-and-tools - 知识库与受控工具.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-4-knowledge-and-tools - 知识库与受控工具.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-5-cross-review-and-evaluation - 交叉评审与评价.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-5-cross-review-and-evaluation - 交叉评审与评价.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-6-dynamic-report-and-ui - 动态报告与产品界面.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-6-dynamic-report-and-ui - 动态报告与产品界面.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-6-workflow-checkpoint-completion - 工作流与Checkpoint恢复.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - phase-7-quality-and-release - 质量与交付边界.md", "docs/remediation - 工程整改实施/2026-07-15 - phase-7-quality-and-release - 质量与交付边界.md"],
  ["docs/remediation - 工程整改实施/2026-07-15 - reporting-standard - 答辩级报告写作规范.md", "docs/remediation - 工程整改实施/2026-07-15 - reporting-standard - 答辩级报告写作规范.md"],
  ["docs/reports - 对外发布报告/2026-07-19 - project-report - 当前项目报告.md", "docs/reports - 对外发布报告/2026-07-19 - project-report - 当前项目报告.md"],
  ["docs/reports - 对外发布报告/旧 - publishing-checklist - 发布检查清单.md", "docs/reports - 对外发布报告/旧 - publishing-checklist - 发布检查清单.md"],
  ["docs/reviews - 历史评审复查/2026-07-15 - code-and-documentation-review - 代码与文档评审.md", "docs/reviews - 历史评审复查/2026-07-15 - code-and-documentation-review - 代码与文档评审.md"],
  ["docs/reviews - 历史评审复查/2026-07-15 - design-alignment-review - 设计对齐复查.md", "docs/reviews - 历史评审复查/2026-07-15 - design-alignment-review - 设计对齐复查.md"],
  ["docs/旧 - roadmap-resume-blueprint - 简历蓝图实现计划.md", "docs/旧 - roadmap-resume-blueprint - 简历蓝图实现计划.md"],
  ["docs/2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md", "docs/2026-07-31 - roadmap-v2-improvement-plan - V2改进计划.md"],
  ["docs/2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md", "docs/2026-08-01 - roadmap-v2-testing-plan - V2验收与实验指南.md"],
  ["docs/screenshots - 公开截图资料/旧 - screenshot-publication-standard - 公开截图规范.md", "docs/screenshots - 公开截图资料/旧 - screenshot-publication-standard - 公开截图规范.md"],
  ["docs/screenshots/2026-07-19 - screenshot-index - 公开截图说明.md", "docs/screenshots/2026-07-19 - screenshot-index - 公开截图说明.md"],
  ["docs/旧 - tier1-evidence-binding-regression - 一级证据绑定回归门禁.md", "docs/旧 - tier1-evidence-binding-regression - 一级证据绑定回归门禁.md"],
  ["docs/2026-08-01 - v2-evidence-baseline - V2证据基线.md", "docs/2026-08-01 - v2-evidence-baseline - V2证据基线.md"],
];

const toNative = (relativePath) => path.join(root, ...relativePath.split("/"));
const sourceSet = new Set(renames.map(([from]) => from));
const targetSet = new Set(renames.map(([, to]) => to));

if (sourceSet.size !== renames.length || targetSet.size !== renames.length) {
  throw new Error("文档重命名映射存在重复源或目标路径。");
}

for (const [from, to] of renames) {
  if (!fs.existsSync(toNative(from))) throw new Error(`源文件不存在：${from}`);
  if (fs.existsSync(toNative(to)) && from !== to) throw new Error(`目标文件已存在：${to}`);
}

console.log(`${dryRun ? "预检" : "执行"}：${renames.length} 份文档`);
for (const [from, to] of renames) console.log(`${from} -> ${to}`);

if (dryRun) process.exit(0);

for (const [from, to] of renames) {
  fs.renameSync(toNative(from), toNative(to));
}

const isTextFile = (file) => /\.(?:md|mdx|ts|tsx|js|mjs|cjs|json|yml|yaml|txt)$/i.test(file) || path.basename(file) === "README.md";
const ignoredDirectories = new Set([".git", ".next", "node_modules", "local-only"]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(path.join(directory, entry.name));
    } else if (isTextFile(entry.name)) {
      files.push(path.join(directory, entry.name));
    }
  }
}
walk(root);

function relativeLink(fromFile, target) {
  const relative = path.relative(path.dirname(fromFile), toNative(target)).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

let changedFiles = 0;
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  const fileRelative = path.relative(root, file).split(path.sep).join("/");

  // 修复 Markdown 相对链接：按链接在来源文件中的真实解析路径匹配，避免 README 同名歧义。
  if (fileRelative.endsWith(".md")) {
    text = text.replace(/(\]\()(<)?([^)>#]+)(#[^)]*)?(>?)\)/g, (match, open, angleStart, rawLink, anchor = "", angleEnd) => {
      if (/^(?:https?:|mailto:|#|data:)/i.test(rawLink)) return match;
      const decoded = decodeURIComponent(rawLink);
      const absolute = path.resolve(path.dirname(file), decoded);
      const candidate = path.relative(root, absolute).split(path.sep).join("/");
      const mapping = renames.find(([from]) => from === candidate);
      if (!mapping) return match;
      const next = relativeLink(file, mapping[1]);
      return `${open}${angleStart ?? ""}${next}${anchor}${angleEnd ?? ""})`;
    });
  }

  // 修复源码、配置和正文中使用项目根目录相对路径的引用。
  for (const [from, to] of renames) {
    text = text.replaceAll(from, to);
  }
  if (text !== before) {
    fs.writeFileSync(file, text, "utf8");
    changedFiles += 1;
  }
}

console.log(`已重命名 ${renames.length} 份文档，更新 ${changedFiles} 个文本文件中的链接或路径引用。`);
