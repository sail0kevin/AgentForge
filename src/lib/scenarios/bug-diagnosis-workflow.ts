import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

export const BugDiagnosisInputSchema = z.object({
  errorLog: z.string().min(10).max(50_000),
  codeContext: z.array(z.object({ path: z.string().min(1).max(300), content: z.string().min(1).max(100_000) })).min(1).max(50),
});

export const RootCauseCandidateSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["missing_environment", "null_access", "module_resolution", "unknown"]),
  confidence: z.enum(["direct_log_match", "context_match", "insufficient_evidence"]),
  evidence: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(10),
});

export const VerificationStepSchema = z.object({
  candidateId: z.string().min(1),
  action: z.string().min(5),
  expectedSignal: z.string().min(5),
});

export const BugDiagnosisReportSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["candidate_found", "insufficient_evidence"]),
  symptom: z.string().min(10),
  rootCauseCandidates: z.array(RootCauseCandidateSchema).max(5),
  verificationSteps: z.array(VerificationStepSchema).max(10),
  repairReport: z.array(z.string().min(5)).min(1),
  limitations: z.array(z.string().min(5)).min(1),
});

export type BugDiagnosisReport = z.infer<typeof BugDiagnosisReportSchema>;
type BugDiagnosisInput = z.infer<typeof BugDiagnosisInputSchema>;
type RootCauseCandidate = z.infer<typeof RootCauseCandidateSchema>;

function firstLogLine(errorLog: string) {
  return errorLog.split("\n").map((line) => line.trim()).find(Boolean) ?? errorLog;
}

/** 仅将错误日志和受限代码上下文中的直接证据关联为候选根因。 */
export function analyzeBugSymptoms(input: BugDiagnosisInput): RootCauseCandidate[] {
  const candidates: RootCauseCandidate[] = [];
  if (/Cannot read (?:properties|property) of (?:undefined|null)/i.test(input.errorLog)) {
    candidates.push({
      id: "null-access",
      category: "null_access",
      confidence: "direct_log_match",
      evidence: [firstLogLine(input.errorLog)],
      explanation: "日志直接表明代码在未检查对象存在性的情况下读取了属性。",
    });
  }
  const missingEnv = input.errorLog.match(/(?:Missing|undefined) (?:environment variable|env(?:ironment)? variable)[:\s]+([A-Z][A-Z0-9_]+)/i);
  if (missingEnv) {
    candidates.push({
      id: `missing-env-${missingEnv[1].toLowerCase()}`,
      category: "missing_environment",
      confidence: "direct_log_match",
      evidence: [missingEnv[0]],
      explanation: `日志直接指出环境变量 ${missingEnv[1]} 未配置。`,
    });
  }
  const missingModule = input.errorLog.match(/Cannot find module ['"]([^'"]+)['"]/i);
  if (missingModule) {
    candidates.push({
      id: `module-${missingModule[1].replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      category: "module_resolution",
      confidence: "direct_log_match",
      evidence: [missingModule[0]],
      explanation: `日志直接指出模块 ${missingModule[1]} 无法解析。`,
    });
  }
  return candidates;
}

function buildVerificationSteps(candidates: RootCauseCandidate[]) {
  return candidates.map((candidate) => {
    if (candidate.category === "missing_environment") return { candidateId: candidate.id, action: "在不输出敏感值的前提下检查部署环境是否存在该变量。", expectedSignal: "变量存在且应用启动后不再报告缺失。" };
    if (candidate.category === "null_access") return { candidateId: candidate.id, action: "为出错路径添加输入断言，并用触发日志的最小输入复现。", expectedSignal: "断言定位空值来源，或修复后该输入不再抛出属性访问错误。" };
    return { candidateId: candidate.id, action: "核对依赖清单、安装产物和导入路径大小写。", expectedSignal: "模块可被解析，构建或启动不再返回模块缺失错误。" };
  });
}

/** 修复建议只描述验证后的下一步，避免日志匹配直接触发未经确认的代码修改。 */
function buildRepairReport(candidates: RootCauseCandidate[]) {
  return candidates.length > 0
    ? ["先执行每个候选的验证步骤，再仅对被验证的根因实施最小修复。", "修复后保留覆盖该错误路径的回归测试。"]
    : ["现有日志不足以建立可验证候选；请补充完整堆栈、触发输入和相关代码路径。"];
}

const BugDiagnosisState = Annotation.Root({
  input: Annotation<BugDiagnosisInput>,
  symptom: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
  candidates: Annotation<RootCauseCandidate[]>({ reducer: (_, next) => next, default: () => [] }),
  verificationSteps: Annotation<z.infer<typeof VerificationStepSchema>[]>({ reducer: (_, next) => next, default: () => [] }),
  repairReport: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
});

/** 独立的症状分析→根因候选→验证方案图，避免把候选当作已证实根因。 */
export function createBugDiagnosisWorkflowGraph() {
  return new StateGraph(BugDiagnosisState)
    .addNode("symptom_analysis", (state) => ({ symptom: firstLogLine(state.input.errorLog) }))
    .addNode("root_cause_candidates", (state) => ({ candidates: analyzeBugSymptoms(state.input) }))
    .addNode("verification_plan", (state) => ({ verificationSteps: buildVerificationSteps(state.candidates) }))
    .addNode("repair_report", (state) => ({ repairReport: buildRepairReport(state.candidates) }))
    .addEdge(START, "symptom_analysis")
    .addEdge("symptom_analysis", "root_cause_candidates")
    .addEdge("root_cause_candidates", "verification_plan")
    .addEdge("verification_plan", "repair_report")
    .addEdge("repair_report", END)
    .compile();
}

export async function runBugDiagnosisWorkflow(input: BugDiagnosisInput): Promise<BugDiagnosisReport> {
  const parsed = BugDiagnosisInputSchema.parse(input);
  const result = await createBugDiagnosisWorkflowGraph().invoke({ input: parsed });
  const found = result.candidates.length > 0;
  return BugDiagnosisReportSchema.parse({
    schemaVersion: 1,
    status: found ? "candidate_found" : "insufficient_evidence",
    symptom: result.symptom,
    rootCauseCandidates: result.candidates,
    verificationSteps: result.verificationSteps,
    repairReport: result.repairReport,
    limitations: ["当前基线不执行代码，也不把日志模式匹配视为已经验证的根因。"],
  });
}
