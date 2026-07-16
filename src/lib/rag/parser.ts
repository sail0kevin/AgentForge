export type ParsedDocument = {
  title: string;
  content: string;
  format: string;
  size: number;
};

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".json", ".csv", ".log", ".yaml", ".yml", ".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".css", ".html", ".xml", ".sh", ".sql"];

export function parseFile(fileName: string, content: string, byteSize = new TextEncoder().encode(content).byteLength): ParsedDocument {
  const extension = getFileExtension(fileName);
  const format = getFormat(extension);
  const title = fileName.replace(/\.[^.]+$/, "");

  return {
    title,
    content: extractText(content, format),
    format,
    size: byteSize,
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
      // Markdown标题是后续按章节切块和引用追踪的结构信息，不能在切块前删除。
      return normalizeMarkdown(content);
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

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
