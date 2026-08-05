/**
 * agent-metrics 公共类型：有效性分档、数据出处、统一输出壳。
 *
 * 设计取舍：
 *   - 脚本无法从数据本身可靠推断"这批数据来自桩路径还是真实模型路径"，
 *     因此 provenance 由调用方通过 --data-source 显式声明，默认 unknown。
 *   - 最终 validity 由"样本健全性"和 "provenance" 共同决定，取更保守的一档。
 */

/** 数据出处：调用方声明这批数据是怎么产生的。 */
export type DataSource = "stub" | "real-model" | "mixed" | "unknown";

/** 有效性分档：对外陈述时这个结论能被用到什么程度。 */
export type Validity = "invalid" | "mechanism-only" | "full";

/** 单个指标脚本的统一输出壳。 */
export interface MetricResult<TData> {
  metric: string;
  ok: boolean;
  data: TData;
  /** 有效性分档：invalid 表示不可用；mechanism-only 表示仅机制级结论可用；full 表示全部可用。 */
  validity: Validity;
  /** 人类可读的限制说明。validity !== full 时必填。 */
  limitation?: string;
}

/** 纯计算函数的输出（不含 ok，由 CLI 壳添加）。 */
export interface MetricComputeOutput<TData> {
  metric: string;
  data: TData;
  validity: Validity;
  limitation?: string;
}

/**
 * 根据样本健全性和数据出处计算最终 validity。
 *
 * 规则：
 *   - degenerate（如全 0 延迟导致排序退化）→ invalid
 *   - 零样本 → invalid
 *   - provenance 为 unknown → 最多 mechanism-only（即使样本看起来正常）
 *   - provenance 为 stub → 最多 mechanism-only
 *   - provenance 为 real-model 或 mixed + 样本健全 → full
 */
export function computeValidity(input: {
  hasDegenerate: boolean;
  sampleSize: number;
  dataSource: DataSource;
}): Validity {
  if (input.hasDegenerate) return "invalid";
  if (input.sampleSize === 0) return "invalid";

  switch (input.dataSource) {
    case "real-model":
      return "full";
    case "mixed":
      return "full";
    case "stub":
      return "mechanism-only";
    case "unknown":
    default:
      return "mechanism-only";
  }
}

/** 解析 --data-source CLI 参数，非法值退回 unknown（最保守）。 */
export function parseDataSource(raw: string | undefined): DataSource {
  const valid: DataSource[] = ["stub", "real-model", "mixed", "unknown"];
  return valid.includes(raw as DataSource) ? (raw as DataSource) : "unknown";
}
