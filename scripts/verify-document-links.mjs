import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const documents = [];
const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith(".md")) documents.push(target);
  }
}

walk(docsRoot);

for (const document of documents) {
  const basename = path.basename(document);
  if (!/^(?:20\d{2}-\d{2}-\d{2}|旧) - [A-Za-z0-9][A-Za-z0-9-]* - .+\.md$/.test(basename)) {
    failures.push(`文件名不符合“日期 - english-name - 中文名.md”：${path.relative(root, document)}`);
  }

  const text = fs.readFileSync(document, "utf8");
  const links = text.matchAll(/!?\[[^\]]*\]\((?:<)?([^\s)>#]+(?:\s[^)>#]+)?)(?:#[^)]+)?(?:>)?\)/g);
  for (const match of links) {
    const rawLink = match[1].trim();
    if (/^(?:https?:|mailto:|data:|#)/i.test(rawLink)) continue;
    const target = path.resolve(path.dirname(document), decodeURIComponent(rawLink));
    if (!fs.existsSync(target)) {
      failures.push(`${path.relative(root, document)} 中链接不存在：${rawLink}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`文档命名和本地链接校验通过：${documents.length} 份 Markdown 文档。`);
