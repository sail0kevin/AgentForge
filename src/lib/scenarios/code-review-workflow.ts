import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

export const CodeReviewFileSchema = z.object({
  path: z.string().min(1).max(300),
  content: z.string().min(1).max(100_000),
});

export const CodeReviewAnalysisScopeSchema = z.object({
  reviewGoal: z.string().min(1).max(500),
  filesInScope: z.array(z.string().min(1)).min(1).max(50),
  evidenceBoundary: z.literal("direct_source_text_patterns_only"),
});

export const StaticCodeFindingSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(["high", "medium", "low"]),
  rule: z.enum(["possible_secret", "unsafe_dynamic_execution", "debug_console"]),
  message: z.string().min(5),
  evidence: z.string().min(1).max(500),
});

export const CodeReviewSuggestionSchema = z.object({
  id: z.string().min(1),
  orientation: z.enum(["minimal_change", "defense_in_depth"]),
  findingIds: z.array(z.string()).min(1),
  summary: z.string().min(5),
  steps: z.array(z.string().min(5)).min(1),
});

export const CodeReviewReportSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["clean", "needs_attention"]),
  analysisScope: CodeReviewAnalysisScopeSchema,
  filesAnalyzed: z.number().int().nonnegative(),
  findings: z.array(StaticCodeFindingSchema),
  suggestions: z.array(CodeReviewSuggestionSchema),
  limitations: z.array(z.string().min(5)).min(1),
});

export type CodeReviewFile = z.infer<typeof CodeReviewFileSchema>;
export type CodeReviewAnalysisScope = z.infer<typeof CodeReviewAnalysisScopeSchema>;
export type StaticCodeFinding = z.infer<typeof StaticCodeFindingSchema>;
export type CodeReviewReport = z.infer<typeof CodeReviewReportSchema>;

function lineAt(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

/**
 * 将调用方声明的审查目标固化为本次图运行的边界。
 * 基线不会根据目标推断语义结论，后续节点只扫描受限源码文本中的直接模式。
 */
export function analyzeCodeReviewScope(input: { files: CodeReviewFile[]; reviewGoal?: string }): CodeReviewAnalysisScope {
  return {
    reviewGoal: input.reviewGoal?.trim() || "识别可由源码文本直接证明的风险模式",
    filesInScope: input.files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
    evidenceBoundary: "direct_source_text_patterns_only",
  };
}

function findAll(input: { file: CodeReviewFile; expression: RegExp; severity: StaticCodeFinding["severity"]; rule: StaticCodeFinding["rule"]; message: string }) {
  const findings: StaticCodeFinding[] = [];
  for (const match of input.file.content.matchAll(input.expression)) {
    const index = match.index ?? 0;
    findings.push({
      id: `${input.file.path}:${input.rule}:${lineAt(input.file.content, index)}`,
      path: input.file.path,
      line: lineAt(input.file.content, index),
      severity: input.severity,
      rule: input.rule,
      message: input.message,
      evidence: match[0].slice(0, 500),
    });
  }
  return findings;
}

/**
 * 基线分析器只报告可由源码文本直接证明的模式；它不替代 TypeScript、SAST 或人工安全审查。
 */
export function analyzeCodeSnapshot(files: CodeReviewFile[]) {
  return files.flatMap((file) => [
    ...findAll({ file, expression: /\b(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"'\s]{8,}["']/gi, severity: "high", rule: "possible_secret", message: "检测到疑似硬编码凭证，应改为服务端受控配置。" }),
    ...findAll({ file, expression: /\b(?:eval|Function)\s*\(/g, severity: "high", rule: "unsafe_dynamic_execution", message: "检测到动态执行入口，应使用受限解析或显式分支替代。" }),
    ...findAll({ file, expression: /\bconsole\.(?:log|debug)\s*\(/g, severity: "low", rule: "debug_console", message: "检测到调试输出，发布前应删除或接入受控日志。" }),
  ]).sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.rule.localeCompare(right.rule));
}

function buildSuggestions(findings: StaticCodeFinding[]) {
  if (findings.length === 0) return [];
  const ids = findings.map((finding) => finding.id);
  return [
    {
      id: "minimal-change",
      orientation: "minimal_change" as const,
      findingIds: ids,
      summary: "以最小范围移除已证实的风险模式。",
      steps: ["将凭证和敏感配置移至服务端环境变量或凭证存储。", "删除动态执行和调试输出，保留等价的显式逻辑。"],
    },
    {
      id: "defense-in-depth",
      orientation: "defense_in_depth" as const,
      findingIds: ids,
      summary: "在修复当前发现的同时，增加可持续的防护门禁。",
      steps: ["为对应规则增加静态检查或单元测试，防止同类模式回归。", "在代码评审与 CI 中记录该类风险的处置证据。"],
    },
  ];
}

const CodeReviewState = Annotation.Root({
  files: Annotation<CodeReviewFile[]>({ reducer: (_, next) => next, default: () => [] }),
  analysisScope: Annotation<CodeReviewAnalysisScope>({
    reducer: (_, next) => next,
    default: () => ({ reviewGoal: "", filesInScope: [], evidenceBoundary: "direct_source_text_patterns_only" }),
  }),
  findings: Annotation<StaticCodeFinding[]>({ reducer: (_, next) => next, default: () => [] }),
  suggestions: Annotation<z.infer<typeof CodeReviewSuggestionSchema>[]>({ reducer: (_, next) => next, default: () => [] }),
});

/** 独立场景图复用 StateGraph 的节点编排，不依赖需求规划主工作流的数据库 Artifact。 */
export function createCodeReviewWorkflowGraph() {
  return new StateGraph(CodeReviewState)
    .addNode("requirement_analysis", (state) => ({ analysisScope: analyzeCodeReviewScope({ files: state.files }) }))
    .addNode("static_analysis", (state) => ({ findings: analyzeCodeSnapshot(state.files) }))
    .addNode("candidate_remediations", (state) => ({ suggestions: buildSuggestions(state.findings) }))
    .addEdge(START, "requirement_analysis")
    .addEdge("requirement_analysis", "static_analysis")
    .addEdge("static_analysis", "candidate_remediations")
    .addEdge("candidate_remediations", END)
    .compile();
}

export async function runCodeReviewWorkflow(input: { files: CodeReviewFile[]; reviewGoal?: string }): Promise<CodeReviewReport> {
  const files = z.array(CodeReviewFileSchema).min(1).max(50).parse(input.files);
  const reviewGoal = input.reviewGoal === undefined ? undefined : z.string().min(1).max(500).parse(input.reviewGoal);
  const result = await createCodeReviewWorkflowGraph().invoke({
    files,
    // 审查目标通过状态传递，避免节点从全局变量或不受控上下文读取输入。
    analysisScope: analyzeCodeReviewScope({ files, reviewGoal }),
  });
  return CodeReviewReportSchema.parse({
    schemaVersion: 1,
    status: result.findings.length === 0 ? "clean" : "needs_attention",
    analysisScope: { ...result.analysisScope, reviewGoal: reviewGoal ?? result.analysisScope.reviewGoal },
    filesAnalyzed: files.length,
    findings: result.findings,
    suggestions: result.suggestions,
    limitations: ["当前基线仅识别有限的源码文本模式，不执行代码、不解析完整语义，也不替代专业安全审查。"],
  });
}
