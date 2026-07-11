import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hashed = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt}:${hashed.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return keyBuffer.length === derived.length && timingSafeEqual(keyBuffer, derived);
}