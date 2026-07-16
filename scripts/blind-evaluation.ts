import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeBlindEvaluation, prepareBlindEvaluation, renderBlindEvaluationMarkdown } from "../src/lib/review/blind-evaluation";

function value(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readJson(path: string) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function write(path: string, content: string) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function usage(): never {
  throw new Error("Usage: prepare --input runs.json --packet packet.json --reveal reveal.json [--seed value] [--allow-identity-leakage] | analyze --reveal reveal.json --scores rater-a.json,rater-b.json --output result.md");
}

async function main() {
  const mode = process.argv[2];
  if (mode === "prepare") {
    const input = value("--input"); const packet = value("--packet"); const reveal = value("--reveal");
    if (!input || !packet || !reveal) usage();
    const prepared = prepareBlindEvaluation(await readJson(input), value("--seed"), process.argv.includes("--allow-identity-leakage"));
    await write(packet, `${JSON.stringify(prepared.packet, null, 2)}\n`);
    await write(reveal, `${JSON.stringify(prepared.reveal, null, 2)}\n`);
    console.log(`Prepared ${prepared.packet.entries.length} anonymized entries. Keep ${resolve(reveal)} private until all score sheets are submitted.`);
    if (prepared.leakageWarnings.length) console.warn(`Protocol deviation accepted: potential variant or case identifiers in packet entries: ${prepared.leakageWarnings.join(", ")}`);
    return;
  }
  if (mode === "analyze") {
    const reveal = value("--reveal"); const scores = value("--scores"); const output = value("--output");
    if (!reveal || !scores || !output) usage();
    const analysis = analyzeBlindEvaluation({ reveal: await readJson(reveal), scoreSheets: await Promise.all(scores.split(",").filter(Boolean).map(readJson)) });
    await write(output, renderBlindEvaluationMarkdown(analysis));
    console.log(`Analyzed ${analysis.caseCount} cases and ${analysis.raterCount} raters: ${analysis.eligibleForClaim ? "eligible" : "not eligible"}.`);
    return;
  }
  usage();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
