import { readFile } from "node:fs/promises";
import path from "node:path";
import { hashBlindCaseManifest, validateBlindCaseManifest } from "../src/lib/review/blind-case-manifest";

async function main() {
  const manifestPath = path.resolve(process.argv[2] ?? "docs/quality - 质量评测/case-manifest.json");
  const manifest = validateBlindCaseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  console.log(JSON.stringify({
    manifestPath,
    caseCount: manifest.cases.length,
    categories: Object.fromEntries(["website", "admin", "learning"].map((category) => [category, manifest.cases.filter((item) => item.category === category).length])),
    sha256: hashBlindCaseManifest(manifest),
    frozenAt: manifest.frozenAt,
    protocolVersion: manifest.protocolVersion,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
