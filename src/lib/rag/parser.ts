export type ParsedDocument = {
  title: string;
  content: string;
  format: string;
  size: number;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".json", ".csv", ".log", ".yaml", ".yml", ".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".css", ".html", ".xml", ".sh", ".sql"];

export function parseFile(fileName: string, content: string): ParsedDocument {
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File "${fileName}" exceeds the 5MB size limit.`);
  }

  const extension = getFileExtension(fileName);
  const format = getFormat(extension);
  const title = fileName.replace(/\.[^.]+$/, "");

  return {
    title,
    content: extractText(content, format),
    format,
    size: content.length,
  };
}

export function isSupportedFormat(fileName: string): boolean {
  const ext = getFileExtension(fileName).toLowerCase();
  return TEXT_EXTENSIONS.includes(ext);
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot);
}

function getFormat(extension: string): string {
  const map: Record<string, string> = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".json": "json",
    ".csv": "csv",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
  };
  return map[extension.toLowerCase()] ?? "text";
}

function extractText(content: string, format: string): string {
  switch (format) {
    case "markdown":
      return stripMarkdownSyntax(content);
    case "json":
      try {
        return JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        return content;
      }
    default:
      return content;
  }
}

function stripMarkdownSyntax(content: string): string {
  return content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
