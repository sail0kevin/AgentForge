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

function runScript(file: string) {
  const scriptPath = path.join(__dirname, file);
  const output = execFileSync(process.execPath, [TSX_CLI, scriptPath], { encoding: "utf8" });
  return JSON.parse(output);
}

async function main() {
  const results = SCRIPTS.map(({ metric, file }) => {
    try {
      return { metric, ok: true, data: runScript(file) };
    } catch (error) {
      return { metric, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const generatedAt = new Date().toISOString();
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({
    report: "agent-effectiveness-metrics",
    generatedAt,
    results,
    limitation: "This aggregates whatever data currently exists in the database. Zero-sample metrics are not effectiveness claims; they mean no workflow runs have been recorded yet.",
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
