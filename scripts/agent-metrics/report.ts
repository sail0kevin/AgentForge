import { execFileSync } from "node:child_process";
import path from "node:path";

const SCRIPTS = [
  { metric: "tool-reliability", file: "tool-reliability.ts" },
  { metric: "structured-output-quality", file: "structured-output-quality.ts" },
  { metric: "evidence-support-rate", file: "evidence-support-rate.ts" },
  { metric: "human-intervention-rate", file: "human-intervention-rate.ts" },
  { metric: "latency-and-cost", file: "latency-and-cost.ts" },
];

const TSX_CLI = require.resolve("tsx/cli");

function runScript(file: string, dataSource: string): unknown {
  const scriptPath = path.join(__dirname, file);
  const output = execFileSync(process.execPath, [TSX_CLI, scriptPath, "--data-source", dataSource], { encoding: "utf8" });
  return JSON.parse(output);
}

/** 从 CLI 参数解析 --data-source，传给每个子脚本。 */
function parseDataSource(): string {
  const idx = process.argv.indexOf("--data-source");
  const valid = ["stub", "real-model", "mixed", "unknown"];
  const raw = idx === -1 ? "unknown" : process.argv[idx + 1];
  return valid.includes(raw) ? raw : "unknown";
}

async function main() {
  const dataSource = parseDataSource();
  const results = SCRIPTS.map(({ metric, file }) => {
    try {
      const data = runScript(file, dataSource);
      return { metric, ok: true, data };
    } catch (error) {
      return { metric, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const generatedAt = new Date().toISOString();
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    report: "agent-effectiveness-metrics",
    generatedAt,
    dataSource,
    results,
    limitation: "This aggregates whatever data currently exists in the database. Each metric carries its own validity tier (invalid / mechanism-only / full) and limitation. Zero-sample or degenerate metrics are not effectiveness claims.",
  }, null, 2));

  if (failed.length > 0) {
    console.error(`${failed.length} of ${SCRIPTS.length} metric scripts failed to run.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
