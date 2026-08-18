/**
 * Checklist 覆盖率是"关键词子串匹配"，只有当被评分文本与关键词属于同一文字系统时，匹配结果才有意义。
 *
 * 真实消融运行暴露过这个失效：多智能体链路的最终产物整段漂移成英文，中文关键词一个都匹配不到，
 * 覆盖率于是被记成 0.00 —— 但那是"测量失效"，不是"质量为零"。三个多智能体臂各有 48%~53%
 * 的输出发生漂移，单 Agent 臂 0%，等于把架构对比悄悄换成了 prompt 语言差异对比。
 *
 * 本模块提供纯函数判据，让运行脚本把这种运行记成显式 excluded，而不是一个看起来合法的低分。
 * 判据锚在关键词而非需求文本上：失效机制来自关键词匹配，不变量也必须守在关键词这一侧。
 */

/** 汉字（含扩展 A 与兼容区）。不统计中文标点，判据只依赖表意文字本身。 */
const CJK_IDEOGRAPH_PATTERN = /[㐀-䶿一-鿿豈-﫿]/gu;
const LATIN_LETTER_PATTERN = /[A-Za-z]/gu;

/**
 * 一个汉字承载的信息量约等于数个拉丁字母，按原始字符数直接比较会把英文文本严重高估。
 * 该系数只用于判别"哪种文字系统占主导"，不参与任何计费、评分或统计。
 */
const LATIN_LETTERS_PER_CJK_IDEOGRAPH = 5;

export type ScriptFamily = "cjk" | "latin";

export type ScriptShare = {
  /** 归一化占比，cjk 与 latin 之和为 1；文本中没有可判别字符时两者都是 0。 */
  cjk: number;
  latin: number;
};

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

export function measureScriptShare(text: string): ScriptShare {
  const cjkWeight = countMatches(text, CJK_IDEOGRAPH_PATTERN);
  const latinWeight = countMatches(text, LATIN_LETTER_PATTERN) / LATIN_LETTERS_PER_CJK_IDEOGRAPH;
  const total = cjkWeight + latinWeight;
  if (total === 0) return { cjk: 0, latin: 0 };
  return { cjk: cjkWeight / total, latin: latinWeight / total };
}

/** 无可判别字符时返回 null，调用方必须据此放弃判断，而不是假定某个默认语言。 */
export function detectDominantScript(text: string): ScriptFamily | null {
  const share = measureScriptShare(text);
  if (share.cjk === 0 && share.latin === 0) return null;
  return share.cjk >= share.latin ? "cjk" : "latin";
}

/**
 * 被评分文本至少要保留关键词所属文字系统的这一比例占比，低于则视为语言漂移。
 *
 * 0.25 由 89 份真实输出反查确定：0.15~0.35 区间内结论完全一致（漏检 0 个 coverage=0 样本、
 * 误杀 0 个 coverage=1 样本），说明该分布本身是双峰的、取值不敏感；升到 0.50 会开始误杀
 * 中英混排但关键词确实全命中的样本。
 */
export const SCORING_LANGUAGE_MIN_SHARE_FACTOR = 0.25;

/** ledger 中标记该失效的固定错误码，供报告脚本与真实低分区分开。 */
export const SCORING_LANGUAGE_MISMATCH_CODE = "SCORING_LANGUAGE_MISMATCH";

export type ScoringLanguageCheck = {
  expectedScript: ScriptFamily | null;
  expectedShare: number;
  textShare: number;
  requiredShare: number;
  consistent: boolean;
};

export function checkScoringLanguageConsistency(input: {
  keywords: readonly string[];
  scoredText: string;
}): ScoringLanguageCheck {
  const keywordText = input.keywords.join(" ");
  const expectedScript = detectDominantScript(keywordText);
  if (!expectedScript) {
    // 关键词本身没有可判别文字（例如全是数字或符号）时不下结论，避免凭空排除有效运行。
    return { expectedScript: null, expectedShare: 0, textShare: 0, requiredShare: 0, consistent: true };
  }
  const expectedShare = measureScriptShare(keywordText)[expectedScript];
  const textShare = measureScriptShare(input.scoredText)[expectedScript];
  const requiredShare = expectedShare * SCORING_LANGUAGE_MIN_SHARE_FACTOR;
  return { expectedScript, expectedShare, textShare, requiredShare, consistent: textShare >= requiredShare };
}
