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
  const sections = text.split(/(?=#{1,6}\s)/);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  let currentLine = 0;

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length === 0) continue;

    const sectionLines = section.split("\n");
    const endLine = currentLine + sectionLines.length - 1;

    if (trimmed.length <= 1200) {
      chunks.push({
        id: `${documentId}-chunk-${chunkIndex}`,
        documentId,
        content: trimmed,
        startLine: currentLine,
        endLine,
        metadata: { chunkIndex: String(chunkIndex), type: "section" },
      });
      chunkIndex += 1;
    } else {
      const subChunks = chunkText(trimmed, documentId, { chunkSize: 800, chunkOverlap: 100 });
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          id: `${documentId}-chunk-${chunkIndex}`,
          startLine: currentLine + sub.startLine,
          endLine: currentLine + sub.endLine,
          metadata: { ...sub.metadata, chunkIndex: String(chunkIndex), type: "section" },
        });
        chunkIndex += 1;
      }
    }

    currentLine = endLine + 1;
  }

  return chunks;
}
