-- CreateTable
CREATE TABLE "DocumentChunkEmbedding" (
    "chunkId" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "vectorJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DocumentChunkEmbedding_model_idx" ON "DocumentChunkEmbedding"("model");
