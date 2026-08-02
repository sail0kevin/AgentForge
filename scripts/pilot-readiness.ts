import { assessPilotReadiness } from "../src/lib/pilot/readiness";

const target = process.argv.includes("--production") ? "production" : "development";
const result = assessPilotReadiness(process.env, target);

for (const check of result.checks) {
  const label = check.status.toUpperCase().padEnd(4);
  console.log(`${label} ${check.name}: ${check.message}`);
}

console.log(`目标环境：${result.target}`);
console.log(result.ready ? "试点配置预检通过。" : "试点配置预检失败，请修复 FAIL 项后再启动。" );
if (!result.ready) process.exitCode = 1;
