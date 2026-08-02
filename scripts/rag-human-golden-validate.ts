import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  HUMAN_GOLDEN_DOCUMENT_TYPES,
  assessHumanGoldenSetReadiness,
  validateHumanGoldenSet,
  type HumanGoldenDocumentType,
} from "../src/lib/rag/human-golden-set";

function parseArguments(argumentsList: string[]) {
  const [input, ...options] = argumentsList;
  if (input?.startsWith("--")) {
    throw new Error(`RAG_HUMAN_GOLDEN_ARGUMENT_UNKNOWN: ${input}`);
  }
  let minimumCaseCount = 100;
  let requiredDocumentTypes: HumanGoldenDocumentType[] | undefined;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--required-document-types") {
      const value = options[index + 1];
      if (!value) throw new Error("RAG_HUMAN_GOLDEN_REQUIRED_DOCUMENT_TYPES_REQUIRED");
      const parsedTypes = value.split(",").map((item) => item.trim()).filter(Boolean);
      if (!parsedTypes.every((item): item is HumanGoldenDocumentType => HUMAN_GOLDEN_DOCUMENT_TYPES.includes(item as HumanGoldenDocumentType))) {
        throw new Error("RAG_HUMAN_GOLDEN_REQUIRED_DOCUMENT_TYPE_INVALID");
      }
      requiredDocumentTypes = parsedTypes;
      if (!requiredDocumentTypes.length) throw new Error("RAG_HUMAN_GOLDEN_REQUIRED_DOCUMENT_TYPES_REQUIRED");
      index += 1;
      continue;
    }
    if (options[index] !== "--minimum-case-count") {
      throw new Error(`RAG_HUMAN_GOLDEN_ARGUMENT_UNKNOWN: ${options[index]}`);
    }
    const value = options[index + 1];
    if (!value) throw new Error("RAG_HUMAN_GOLDEN_MINIMUM_CASE_COUNT_REQUIRED");
    minimumCaseCount = Number(value);
    index += 1;
  }
  return { input, minimumCaseCount, requiredDocumentTypes };
}

async function main() {
  const { input, minimumCaseCount, requiredDocumentTypes } = parseArguments(process.argv.slice(2));
  if (!input) throw new Error("RAG_HUMAN_GOLDEN_INPUT_REQUIRED: pass a reviewed human Golden Set JSON file");
  const inputPath = path.resolve(input);
  const dataset = validateHumanGoldenSet(JSON.parse(await readFile(inputPath, "utf8")));
  console.log(JSON.stringify({
    status: "validated",
    inputPath,
    readiness: assessHumanGoldenSetReadiness(dataset, minimumCaseCount, requiredDocumentTypes),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
