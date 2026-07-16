import { decryptApiKey } from "@/lib/security/crypto";

type StoredCredential = {
  encryptedKey: string;
  iv: string;
  authTag: string;
};

/** 凭证解密属于安全边界，不应由 Provider Router 承担。 */
export function decryptStoredApiKey(apiKey?: StoredCredential | null) {
  if (!apiKey) return null;
  return decryptApiKey(apiKey.encryptedKey, apiKey.iv, apiKey.authTag);
}
