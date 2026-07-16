export const DOCUMENT_UPLOAD_LIMITS = {
  maxRequestBytes: 6 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  maxFileNameLength: 255,
  maxDocumentsPerUser: 100,
  maxTotalBytesPerUser: 50 * 1024 * 1024,
  maxChunksPerDocument: 2_000,
  maxChunksPerUser: 20_000,
} as const;

export type KnowledgeSourceMetadata = {
  sourceType: "local-upload" | "curated-reference" | "project-decision";
  sourceUrl: string | null;
  sourceVersion: string;
  license: string;
  reviewedAt: Date | null;
};

function optionalFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseKnowledgeSourceMetadata(formData: FormData): KnowledgeSourceMetadata {
  const rawType = optionalFormText(formData, "sourceType") || "local-upload";
  const sourceTypes: KnowledgeSourceMetadata["sourceType"][] = ["local-upload", "curated-reference", "project-decision"];
  if (!sourceTypes.includes(rawType as KnowledgeSourceMetadata["sourceType"])) throw new DocumentUploadError("INVALID_SOURCE_TYPE", "Unsupported knowledge source type.", 422);
  const sourceUrl = optionalFormText(formData, "sourceUrl");
  if (sourceUrl.length > 1_000) throw new DocumentUploadError("SOURCE_URL_TOO_LONG", "Source URL is too long.", 422);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("unsafe");
    } catch {
      throw new DocumentUploadError("INVALID_SOURCE_URL", "Source URL must be a safe HTTP(S) URL.", 422);
    }
  }
  const sourceVersion = optionalFormText(formData, "sourceVersion") || "1";
  const license = optionalFormText(formData, "license") || "unspecified";
  if (sourceVersion.length > 100) throw new DocumentUploadError("SOURCE_VERSION_TOO_LONG", "Source version is too long.", 422);
  if (license.length > 120) throw new DocumentUploadError("LICENSE_TOO_LONG", "License value is too long.", 422);
  const reviewedAtValue = optionalFormText(formData, "reviewedAt");
  const reviewedAt = reviewedAtValue ? new Date(reviewedAtValue) : null;
  if (reviewedAtValue && Number.isNaN(reviewedAt?.getTime())) throw new DocumentUploadError("INVALID_REVIEWED_AT", "reviewedAt must be a valid ISO date.", 422);
  return { sourceType: rawType as KnowledgeSourceMetadata["sourceType"], sourceUrl: sourceUrl || null, sourceVersion, license, reviewedAt };
}

export type DocumentUsage = {
  documentCount: number;
  totalBytes: number;
  totalChunks: number;
};

export class DocumentUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocumentUploadError";
  }
}

/** Content-Length 可在 multipart 解析前挡住明显超大的请求；缺失时仍由 file.size 二次校验。 */
export function assertUploadRequestSize(headers: Pick<Headers, "get">): void {
  const rawLength = headers.get("content-length");
  if (!rawLength) return;
  const contentLength = Number(rawLength);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new DocumentUploadError("INVALID_CONTENT_LENGTH", "Invalid Content-Length header.", 400);
  }
  if (contentLength > DOCUMENT_UPLOAD_LIMITS.maxRequestBytes) {
    throw new DocumentUploadError("REQUEST_TOO_LARGE", "Upload request exceeds the 6 MiB request limit.", 413);
  }
}

/** 必须在 arrayBuffer()/text() 之前调用，使用 File.size 的真实字节数。 */
export function assertUploadFileMetadata(file: Pick<File, "name" | "size">): void {
  if (!file.name || file.name.length > DOCUMENT_UPLOAD_LIMITS.maxFileNameLength || file.name.includes("\0")) {
    throw new DocumentUploadError("INVALID_FILE_NAME", "File name is empty or too long.", 400);
  }
  if (file.size === 0) {
    throw new DocumentUploadError("EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (file.size > DOCUMENT_UPLOAD_LIMITS.maxFileBytes) {
    throw new DocumentUploadError("FILE_TOO_LARGE", "File exceeds the 5 MiB size limit.", 413);
  }
}

export function decodeUtf8Document(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentUploadError("INVALID_UTF8", "The file is not valid UTF-8 text.", 422);
  }
}

export function assertDocumentQuota(usage: DocumentUsage, incomingBytes: number, incomingChunks: number): void {
  if (incomingChunks === 0) {
    throw new DocumentUploadError("EMPTY_DOCUMENT", "The file does not contain indexable text.", 422);
  }
  if (incomingChunks > DOCUMENT_UPLOAD_LIMITS.maxChunksPerDocument) {
    throw new DocumentUploadError("TOO_MANY_CHUNKS", `Document creates more than ${DOCUMENT_UPLOAD_LIMITS.maxChunksPerDocument} chunks.`, 422);
  }
  if (usage.documentCount >= DOCUMENT_UPLOAD_LIMITS.maxDocumentsPerUser) {
    throw new DocumentUploadError("DOCUMENT_LIMIT_REACHED", `A user may store at most ${DOCUMENT_UPLOAD_LIMITS.maxDocumentsPerUser} documents.`, 409);
  }
  if (usage.totalBytes + incomingBytes > DOCUMENT_UPLOAD_LIMITS.maxTotalBytesPerUser) {
    throw new DocumentUploadError("STORAGE_QUOTA_EXCEEDED", "User document storage exceeds the 50 MiB quota.", 413);
  }
  if (usage.totalChunks + incomingChunks > DOCUMENT_UPLOAD_LIMITS.maxChunksPerUser) {
    throw new DocumentUploadError("CHUNK_QUOTA_EXCEEDED", `User knowledge base exceeds ${DOCUMENT_UPLOAD_LIMITS.maxChunksPerUser} chunks.`, 413);
  }
}

export function documentUploadErrorResponse(error: unknown): Response {
  if (error instanceof DocumentUploadError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return Response.json({ error: { code: "DOCUMENT_UPLOAD_FAILED", message: "Failed to upload document." } }, { status: 500 });
}
