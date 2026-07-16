import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getAuthMode } from "@/lib/auth/session";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const secret = process.env.ENCRYPTION_MASTER_KEY;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  if (secret) throw new Error("ENCRYPTION_MASTER_KEY must be at least 32 characters.");
  // local 模式可以使用临时开发密钥；session/生产模式必须显式提供真实主密钥。
  if (getAuthMode() === "local" && process.env.NODE_ENV !== "production") {
    return createHash("sha256").update("local-development-secret-change-before-production").digest();
  }
  throw new Error("ENCRYPTION_MASTER_KEY is required outside local development mode.");
}

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encryptedKey: encrypted.toString("base64"), iv: iv.toString("base64"), authTag: authTag.toString("base64"), maskedKey: maskApiKey(apiKey), keyLength: apiKey.length };
}

export function decryptApiKey(encryptedKey: string, iv: string, authTag: string) {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedKey, "base64")), decipher.final()]).toString("utf8");
}

export function maskApiKey(apiKey: string) {
  if (apiKey.length <= 8) return "****";
  return `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`;
}
