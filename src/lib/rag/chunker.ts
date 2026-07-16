export type Chunk = {
  id: string;
  documentId: string;
  content: string;
  startLine: number;
  endLine: number;
  metadata: Record<string, string>;
};

export type ChunkingOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 100;

export function chunkText(text: string, documentId: string, options: ChunkingOptions = {}): Chunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  const lines = text.split("\n");
  if (lines.length === 0) return [];

  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;
  let startLine = 0;
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    currentChunk.push(line);
    currentLength += line.length + 1;

    if (currentLength >= chunkSize || i === lines.length - 1) {
      const content = currentChunk.join("\n").trim();
      if (content.length > 0) {
        chunks.push({
          id: `${documentId}-chunk-${chunkIndex}`,
          documentId,
          content,
          startLine,
          endLine: i,
          metadata: { chunkIndex: String(chunkIndex) },
        });
        chunkIndex += 1;
      }

      if (i < lines.length - 1) {
        const overlapLines = Math.floor(currentChunk.length * (chunkOverlap / Math.max(currentLength, 1)));
        currentChunk = currentChunk.slice(-Math.max(overlapLines, 1));
        startLine = i - currentChunk.length + 1;
        currentLength = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      } else {
        currentChunk = [];
        startLine = i + 1;
        currentLength = 0;
      }
    }
  }

  return chunks;
}

export function chunkMarkdown(text: string, documentId: string): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  const lines = text.split("\n");
  const headingStack: string[] = [];
  const sections: Array<{ startLine: number; endLine: number; lines: string[]; heading?: string; headingLevel?: number; headingPath?: string }> = [];
  let sectionStart = 0;
  let sectionHeading: { title: string; level: number; path: string } | undefined;

  const pushSection = (endLine: number) => {
    const sectionLines = lines.slice(sectionStart, endLine + 1);
    if (sectionLines.join("\n").trim()) sections.push({
      startLine: sectionStart,
      endLine,
      lines: sectionLines,
      heading: sectionHeading?.title,
      headingLevel: sectionHeading?.level,
      headingPath: sectionHeading?.path,
    });
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = lines[lineIndex].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    if (lineIndex > sectionStart) pushSection(lineIndex - 1);
    const level = match[1].length;
    const title = match[2].trim();
    headingStack.length = level - 1;
    headingStack[level - 1] = title;
    sectionStart = lineIndex;
    sectionHeading = { title, level, path: headingStack.filter(Boolean).join(" > ") };
  }
  if (sectionStart < lines.length) pushSection(lines.length - 1);

  for (const section of sections) {
    const content = section.lines.join("\n").trim();
    const metadata = {
      type: "section",
      ...(section.heading ? { heading: section.heading } : {}),
      ...(section.headingLevel ? { headingLevel: String(section.headingLevel) } : {}),
      ...(section.headingPath ? { headingPath: section.headingPath } : {}),
    };
    if (content.length <= 1200) {
      chunks.push({
        id: `${documentId}-chunk-${chunkIndex}`,
        documentId,
        content,
        startLine: section.startLine,
        endLine: section.endLine,
        metadata: { ...metadata, chunkIndex: String(chunkIndex) },
      });
      chunkIndex += 1;
    } else {
      const subChunks = chunkText(content, documentId, { chunkSize: 800, chunkOverlap: 100 });
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          id: `${documentId}-chunk-${chunkIndex}`,
          startLine: section.startLine + sub.startLine,
          endLine: section.startLine + sub.endLine,
          metadata: { ...sub.metadata, ...metadata, chunkIndex: String(chunkIndex) },
        });
        chunkIndex += 1;
      }
    }
  }

  return chunks;
}
