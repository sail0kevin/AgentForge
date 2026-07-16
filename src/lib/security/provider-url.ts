import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string) {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:" )) return true;
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 10 || first === 127 || first === 0 || first === 169 && second === 254 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
}

/**
 * 公网部署时，用户填写的模型地址不能指向内网或本机。
 * 本机开发/Electron 保留 localhost 能力，方便连接 Ollama。
 */
export async function assertSafeProviderUrl(value?: string | null) {
  if (!value || process.env.NODE_ENV !== "production" || process.env.ELECTRON_DESKTOP === "1") return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_PROVIDER_URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("INVALID_PROVIDER_URL");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("UNSAFE_PROVIDER_URL");
}
