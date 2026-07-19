import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBlindScoreTemplate } from "../src/lib/review/blind-score-template";

function value(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const packetPath = value("--packet");
  const raterId = value("--rater");
  const output = value("--output");
  if (!packetPath || !raterId || !output) throw new Error("Usage: --packet packet.json --rater rater-a --output score.json");
  const packet = JSON.parse(await readFile(path.resolve(packetPath), "utf8"));
  const template = createBlindScoreTemplate(packet, raterId);
  const outputPath = path.resolve(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    packetPath: path.resolve(packetPath),
    outputPath,
    packetId: template.packetId,
    raterId: template.raterId,
    scoreCount: template.scores.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
